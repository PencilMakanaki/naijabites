import {Router} from 'express';
import {createDispatchService} from '../deliveries/service.js';
import {requireRole} from './authMiddleware.js';
import {badRequest} from './errors.js';
import {ok} from './respond.js';
const ID=/^[0-9A-HJKMNP-TV-Z]{26}$/i;
export function adminDispatchRoutes({pool}){const r=Router(),s=createDispatchService({pool});r.use(requireRole('admin'));r.get('/',async(req,res)=>ok(res,await s.adminQueue()));r.post('/:orderId/assign',async(req,res)=>ok(res,await s.assign(req.auth.user.id,req.params.orderId,req.body?.riderId)));return r;}
export function riderDeliveryRoutes({pool}){const r=Router(),s=createDispatchService({pool});r.use(requireRole('rider'));r.get('/',async(req,res)=>ok(res,await s.riderDeliveries(req.auth.user.id)));r.post('/:id/:action',async(req,res)=>{if(!ID.test(req.params.id))throw badRequest('Invalid delivery reference.');return ok(res,await s.updateByRider(req.auth.user.id,req.params.id,req.params.action,req.body?.note));});return r;}
