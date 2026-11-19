import { withTransaction } from '../db/pool.js';
import { ulid } from '../security/ids.js';
import { badRequest, conflict, notFound } from '../http/errors.js';

const ID=/^[0-9A-HJKMNP-TV-Z]{26}$/i;
import { DELIVERY_TRANSITIONS, canApplyDeliveryAction } from './transitions.js';

export function createDispatchService({pool}) {
  async function adminQueue(){
    const [orders]=await pool.execute(`SELECT o.public_id AS id,o.status,o.payment_status AS paymentStatus,o.recipient_name AS recipientName,o.recipient_phone AS recipientPhone,o.area,o.city,o.state,o.delivery_zone_name AS deliveryZoneName,o.created_at AS createdAt,d.public_id AS deliveryId,d.status AS deliveryStatus,rp.public_id AS riderId,u.full_name AS riderName
      FROM orders o LEFT JOIN deliveries d ON d.order_id=o.id LEFT JOIN rider_profiles rp ON rp.id=d.rider_id LEFT JOIN users u ON u.id=rp.user_id
      WHERE o.payment_status='paid' AND o.status IN ('confirmed','processing','ready_for_dispatch','out_for_delivery') ORDER BY o.created_at ASC LIMIT 200`);
    const [riders]=await pool.execute(`SELECT rp.public_id AS id,u.full_name AS name,rp.phone,rp.vehicle_type AS vehicleType,rp.vehicle_registration AS vehicleRegistration FROM rider_profiles rp JOIN users u ON u.id=rp.user_id WHERE rp.status='approved' ORDER BY u.full_name`);
    return {orders,riders};
  }
  async function assign(adminId,orderId,riderId){
    if(!ID.test(orderId)||!ID.test(riderId))throw badRequest('Invalid order or rider reference.');
    return withTransaction(pool,async c=>{
      const [os]=await c.execute(`SELECT id,public_id,status,payment_status FROM orders WHERE public_id=? FOR UPDATE`,[orderId]);
      if(!os.length)throw notFound('Order not found.'); const o=os[0];
      if(o.payment_status!=='paid'||!['confirmed','processing','ready_for_dispatch','out_for_delivery'].includes(o.status))throw conflict('Only paid, active orders can be assigned for delivery.');
      const [rs]=await c.execute(`SELECT id,status FROM rider_profiles WHERE public_id=? FOR UPDATE`,[riderId]);
      if(!rs.length||rs[0].status!=='approved')throw conflict('Only approved riders can receive deliveries.');
      const [ds]=await c.execute('SELECT id,status FROM deliveries WHERE order_id=? FOR UPDATE',[o.id]);
      if(ds.length){if(['accepted','picked_up','in_transit','delivered'].includes(ds[0].status))throw conflict('This delivery has already started and cannot be reassigned.');await c.execute(`UPDATE deliveries SET rider_id=?,status='assigned',assigned_at=UTC_TIMESTAMP(3),failed_reason=NULL WHERE id=?`,[rs[0].id,ds[0].id]);}
      else await c.execute(`INSERT INTO deliveries(public_id,order_id,rider_id,status,assigned_at) VALUES(?,?,?,'assigned',UTC_TIMESTAMP(3))`,[ulid(),o.id,rs[0].id]);
      const [[d]]=await c.execute('SELECT id FROM deliveries WHERE order_id=?',[o.id]);
      await c.execute(`INSERT INTO delivery_status_events(delivery_id,actor_user_id,old_status,new_status,note) VALUES(?,?,?,'assigned','Assigned by administrator')`,[d.id,adminId,ds[0]?.status??null]);
      await c.execute(`INSERT INTO audit_log(actor_user_id,actor_role,action,entity_type,entity_id,after_json) VALUES(?,'admin','delivery.assigned','order',?,?)`,[adminId,orderId,JSON.stringify({riderId,status:'assigned'})]);
      return {orderId,status:'assigned',riderId};
    });
  }
  async function riderDeliveries(userId){
    const [rows]=await pool.execute(`SELECT d.public_id AS id,d.status,d.assigned_at AS assignedAt,d.picked_up_at AS pickedUpAt,d.delivered_at AS deliveredAt,o.public_id AS orderId,o.recipient_name AS recipientName,o.recipient_phone AS recipientPhone,o.address_line1 AS addressLine1,o.address_line2 AS addressLine2,o.area,o.city,o.state,o.landmark,o.delivery_instructions AS deliveryInstructions,o.delivery_zone_name AS deliveryZoneName FROM deliveries d JOIN rider_profiles rp ON rp.id=d.rider_id JOIN orders o ON o.id=d.order_id WHERE rp.user_id=? ORDER BY d.created_at DESC LIMIT 100`,[userId]);return rows;
  }
  async function updateByRider(userId,deliveryId,action,note=''){
    if(!ID.test(deliveryId))throw badRequest('Invalid delivery reference.');
    const transition=DELIVERY_TRANSITIONS[action];
    if(!transition)throw badRequest('Invalid delivery action.');
    const [from,to]=transition;
    return withTransaction(pool,async c=>{
      const [rows]=await c.execute(`SELECT d.id,d.status,d.order_id,d.rider_id,o.public_id AS order_public_id FROM deliveries d JOIN rider_profiles rp ON rp.id=d.rider_id JOIN orders o ON o.id=d.order_id WHERE d.public_id=? AND rp.user_id=? FOR UPDATE`,[deliveryId,userId]);
      if(!rows.length)throw notFound('Delivery not found.');const d=rows[0];
      if(!canApplyDeliveryAction(d.status,action))throw conflict(`This delivery cannot be ${action} from its current status.`);
      if(action==='reject')await c.execute(`UPDATE deliveries SET rider_id=NULL,status='pending_assignment',assigned_at=NULL,failed_reason=? WHERE id=?`,[String(note).slice(0,500)||'Rider declined assignment',d.id]);
      else if(action==='pickup')await c.execute(`UPDATE deliveries SET status='picked_up',picked_up_at=UTC_TIMESTAMP(3) WHERE id=?`,[d.id]);
      else if(action==='complete')await c.execute(`UPDATE deliveries SET status='delivered',delivered_at=UTC_TIMESTAMP(3) WHERE id=?`,[d.id]);
      else await c.execute(`UPDATE deliveries SET status=? WHERE id=?`,[to,d.id]);
      await c.execute(`INSERT INTO delivery_status_events(delivery_id,actor_user_id,old_status,new_status,note) VALUES(?,?,?,?,?)`,[d.id,userId,d.status,to,action==='reject'?String(note).slice(0,500)||'Rider declined assignment':null]);
      if(action==='pickup')await c.execute(`UPDATE orders SET status='out_for_delivery' WHERE id=? AND status IN ('confirmed','processing','ready_for_dispatch')`,[d.order_id]);
      if(action==='complete')await c.execute(`UPDATE orders SET status='delivered' WHERE id=?`,[d.order_id]);
      return {id:deliveryId,orderId:d.order_public_id,status:to};
    });
  }
  async function customerTracking(userId,orderId){
    if(!ID.test(orderId))throw badRequest('Invalid order reference.');
    const [rows]=await pool.execute(`SELECT d.public_id AS id,d.status,d.assigned_at AS assignedAt,d.picked_up_at AS pickedUpAt,d.delivered_at AS deliveredAt,rp.phone AS riderPhone,rp.vehicle_type AS vehicleType,u.full_name AS riderName FROM deliveries d JOIN orders o ON o.id=d.order_id LEFT JOIN rider_profiles rp ON rp.id=d.rider_id LEFT JOIN users u ON u.id=rp.user_id WHERE o.public_id=? AND o.user_id=? LIMIT 1`,[orderId,userId]);
    if(!rows.length)return null;const delivery=rows[0];const [events]=await pool.execute(`SELECT new_status AS status,note,created_at AS createdAt FROM delivery_status_events WHERE delivery_id=(SELECT id FROM deliveries WHERE public_id=?) ORDER BY created_at ASC,id ASC`,[delivery.id]);return {...delivery,events};
  }
  return {adminQueue,assign,riderDeliveries,updateByRider,customerTracking};
}
