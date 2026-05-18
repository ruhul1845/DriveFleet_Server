# DriveFleet Server

Express.js + MongoDB backend for the DriveFleet Car Rental Platform.

## Features

- CommonJS Node.js server created in `npm init -y` style
- MongoDB CRUD APIs for cars
- JWT authentication token issued in HTTPOnly cookie
- Protected APIs with middleware
- Booking APIs with booking count increment using `$inc`
- Search by car name using MongoDB `$regex`
- Filter by car type using MongoDB query
- CORS configured for local Next.js client

## Run locally

```bash
npm install
npm run dev
```

Server runs at:

```bash
http://localhost:5000
```

## Important routes

```bash
GET    /api/health
POST   /api/jwt
POST   /api/logout
GET    /api/cars
GET    /api/cars/featured
GET    /api/cars/my-cars?email=user@example.com
GET    /api/cars/:id
POST   /api/cars
PATCH  /api/cars/:id
DELETE /api/cars/:id
POST   /api/bookings
GET    /api/bookings?email=user@example.com
DELETE /api/bookings/:id
POST   /api/seed
```
