import {Router} from 'express';
import {createRiderService} from '../riders/service.js';
import {requireAuth,requireRole} from './authMiddleware.js';
import {ok} from './respond.js';
export function riderProfileRoutes({pool}){const r=Router(),s=createRiderService({pool});r.get('/mine',requireAuth,async(req,res)=>ok(res,await s.mine(req.auth.user.id)));r.post('/apply',requireRole('customer'),async(req,res)=>ok(res,await s.apply(req.auth.user.id,req.body||{}),undefined,201));return r;}
export function adminRiderRoutes({pool}){const r=Router(),s=createRiderService({pool});r.use(requireRole('admin'));r.get('/',async(req,res)=>ok(res,await s.list(typeof req.query.status==='string'?req.query.status:'pending')));r.post('/:id/decision',async(req,res)=>ok(res,await s.decide(req.auth.user.id,req.params.id,req.body?.status,req.body?.reason)));return r;}
