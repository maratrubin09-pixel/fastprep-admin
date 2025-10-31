"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./modules/app.module");
const common_1 = require("@nestjs/common");
const jwt_guard_1 = require("./auth/jwt.guard");
const express = __importStar(require("express"));
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        cors: true,
        bodyParser: true, // Явно включаем встроенный body parser NestJS
    });
    // КРИТИЧЕСКИ ВАЖНО: Body parser ПЕРЕД всеми middleware/guards!
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    // DEBUG: Логируем raw body для всех POST запросов
    app.use((req, res, next) => {
        if (req.method === 'POST' && req.path.includes('/messages')) {
            console.log('🔍 RAW REQUEST - path:', req.path);
            console.log('🔍 RAW REQUEST - body:', JSON.stringify(req.body));
            console.log('🔍 RAW REQUEST - headers:', req.headers['content-type']);
        }
        next();
    });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        transform: false, // ВРЕМЕННО отключаем transform для debug
        forbidNonWhitelisted: false,
    }));
    // Добавляем глобальный JWT guard
    const reflector = app.get(core_1.Reflector);
    app.useGlobalGuards(new jwt_guard_1.JwtAuthGuard(reflector));
    const port = process.env.PORT ? Number(process.env.PORT) : 10000;
    await app.listen(port, '0.0.0.0');
    // eslint-disable-next-line no-console
    console.log(`API listening on :${port}`);
}
bootstrap();
//# sourceMappingURL=main.js.map