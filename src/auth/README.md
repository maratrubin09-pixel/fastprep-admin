# Authentication Middleware

## Overview

This directory contains a simple authentication middleware for development purposes. In production, this should be replaced with proper JWT authentication.

## Current Implementation

The `AuthMiddleware` is a temporary solution that sets `req.user` for all requests, which is required by:
- `PepGuard` (authorization guard)
- `MessagesController` (message sending)
- `EPController` (effective permissions endpoint)

## Usage

### Development Mode (Default)

By default, all requests will use a default user ID:
- User ID: `dev-user-1` (or value from `DEV_USER_ID` env var)

### Testing with Specific User

To test with a specific user, send the `X-User-Id` header:

```bash
curl -X POST http://localhost:3000/api/inbox/threads/thread-123/messages \
  -H "Content-Type: application/json" \
  -H "X-User-Id: user-abc-123" \
  -d '{"text": "Hello, world!"}'
```

### Environment Variables

- `DEV_USER_ID`: Default user ID for development (default: `dev-user-1`)

## Migration to Production

Before deploying to production, this middleware should be replaced with:

1. **JWT Authentication Middleware**
   - Verify JWT token from `Authorization: Bearer <token>` header
   - Extract user ID from JWT payload
   - Set `req.user = { id: userId }` (and other user data as needed)

2. **Recommended Libraries**
   - `@nestjs/passport`
   - `@nestjs/jwt`
   - `passport-jwt`

3. **Example Implementation**

```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: any) {
    return { id: payload.sub, username: payload.username };
  }
}
```

## Security Warning

⚠️ **DO NOT USE THIS MIDDLEWARE IN PRODUCTION** ⚠️

This middleware allows any request to be authenticated as any user (via `X-User-Id` header or default user). This is insecure and should only be used for local development and testing.

## See Also

- [NestJS Authentication](https://docs.nestjs.com/security/authentication)
- [Passport.js](http://www.passportjs.org/)
- Deployment Guide: `/DEPLOYMENT_GUIDE.md` (section on JWT middleware)
