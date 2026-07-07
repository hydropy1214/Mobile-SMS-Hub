import { Router, type IRouter } from "express";
import healthRouter from "./health";
import devicesRouter from "./devices";
import contactsRouter from "./contacts";
import contactListsRouter from "./contact_lists";
import campaignsRouter from "./campaigns";
import messagesRouter from "./messages";
import dashboardRouter from "./dashboard";
import nativeGatewayRouter from "./native-gateway";

const router: IRouter = Router();

router.use(healthRouter);
router.use(devicesRouter);
router.use(contactsRouter);
router.use(contactListsRouter);
router.use(campaignsRouter);
router.use(messagesRouter);
router.use(dashboardRouter);
router.use(nativeGatewayRouter);

export default router;
