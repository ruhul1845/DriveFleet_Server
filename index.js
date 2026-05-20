const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { MongoClient, ObjectId, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;
const mongoUri = process.env.MongoDB_URI || process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || 'DriveFleet';
const carsCollectionName = process.env.CARS_COLLECTION || 'Cars';
const bookingsCollectionName = process.env.BOOKINGS_COLLECTION || 'Bookings';
const jwtSecret = process.env.JWT_SECRET || process.env.BETTER_AUTH_SECRET || 'drivefleet-secret';

if (!mongoUri) {
  console.error('MongoDB URI is missing. Add MongoDB_URI or MONGODB_URI in server .env');
  process.exit(1);
}

const client = new MongoClient(mongoUri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db;
let Cars;
let Bookings;

app.use(
  cors({
    origin: [process.env.CLIENT_URL || 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json());
app.use(cookieParser());



function normalizeCar(car) {
  if (!car) return null;
  return {
    ...car,
    _id: car._id?.toString?.() || car._id,
    name: car.name || car.carName || '',
    price: Number(car.price ?? car.dailyRentPrice ?? 0),
    type: car.type || car.carType || '',
    image: car.image || car.imageUrl || '',
    seats: Number(car.seats ?? car.seatCapacity ?? 0),
    location: car.location || car.pickupLocation || '',
    available: typeof car.available === 'boolean' ? car.available : car.availabilityStatus !== 'Unavailable',
    carName: car.carName || car.name || '',
    dailyRentPrice: Number(car.dailyRentPrice ?? car.price ?? 0),
    carType: car.carType || car.type || '',
    imageUrl: car.imageUrl || car.image || '',
    seatCapacity: Number(car.seatCapacity ?? car.seats ?? 0),
    pickupLocation: car.pickupLocation || car.location || '',
    availabilityStatus: car.availabilityStatus || (car.available === false ? 'Unavailable' : 'Available'),
  };
}

function carToDb(input, user = {}) {
  const available = typeof input.available === 'boolean' ? input.available : input.availabilityStatus !== 'Unavailable';
  return {
    carName: input.carName || input.name,
    dailyRentPrice: Number(input.dailyRentPrice ?? input.price),
    carType: input.carType || input.type,
    imageUrl: input.imageUrl || input.image,
    seatCapacity: Number(input.seatCapacity ?? input.seats),
    pickupLocation: input.pickupLocation || input.location,
    description: input.description,
    availabilityStatus: input.availabilityStatus || (available ? 'Available' : 'Unavailable'),
    ownerEmail: input.ownerEmail || user.email,
    ownerName: input.ownerName || user.name || '',
    booking_count: Number(input.booking_count || 0),
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function isValidId(id) {
  return ObjectId.isValid(id);
}

function verifyToken(req, res, next) {
  const token = req.cookies?.drivefleet_token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, message: 'Unauthorized access. Token missing.' });

  jwt.verify(token, jwtSecret, (error, decoded) => {
    if (error) return res.status(403).json({ success: false, message: 'Forbidden access. Invalid token.' });
    req.user = decoded;
    next();
  });
}

app.get('/', (req, res) => {
  res.send('DriveFleet server is running.');
});

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'DriveFleet API is healthy.' });
});

app.post('/api/auth/jwt', (req, res) => {
  const { email, name, image, photo } = req.body;
  if (!email) return res.status(400).json({ success: false, message: 'Email is required to generate token.' });

  const token = jwt.sign({ email, name: name || '', image: image || photo || '' }, jwtSecret, { expiresIn: '7d' });
  res
    .cookie('drivefleet_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
    .json({ success: true, message: 'JWT token created successfully.' });
});

app.post('/api/auth/logout', (req, res) => {
  res
    .clearCookie('drivefleet_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    })
    .json({ success: true, message: 'Logged out successfully.' });
});

app.post('/api/seed', async (req, res, next) => {
  try {
    const count = await Cars.countDocuments();
    if (count > 0 && req.query.force !== 'true') {
      return res.json({ success: true, message: 'Cars collection already has data. Seed skipped.', count });
    }
    if (req.query.force === 'true') await Cars.deleteMany({ ownerEmail: 'admin@drivefleet.com' });
    const now = new Date().toISOString();
    const result = await Cars.insertMany(sampleCars.map((car) => ({ ...car, createdAt: car.createdAt || now, updatedAt: now })));
    res.status(201).json({ success: true, message: 'Seed data inserted successfully.', insertedCount: result.insertedCount });
  } catch (error) {
    next(error);
  }
});

app.get('/api/cars', async (req, res, next) => {
  try {
    const { search = '', type = '', limit = '' } = req.query;
    const query = {};
    if (search) {
      query.$or = [
        { carName: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
      ];
    }
    if (type && type !== 'All') {
      query.$and = [
        { $or: [{ carType: type }, { type }] }
      ];
    }

    let cursor = Cars.find(query).sort({ createdAt: -1, _id: -1 });
    const parsedLimit = Number(limit);
    if (parsedLimit > 0) cursor = cursor.limit(parsedLimit);

    const cars = (await cursor.toArray()).map(normalizeCar);
    res.json({ success: true, cars, data: cars });
  } catch (error) {
    next(error);
  }
});

app.get('/api/cars/featured', async (req, res, next) => {
  try {
    const cars = (await Cars.find({}).sort({ createdAt: -1, _id: -1 }).limit(6).toArray()).map(normalizeCar);
    res.json({ success: true, cars, data: cars });
  } catch (error) {
    next(error);
  }
});

app.get('/api/cars/my', verifyToken, async (req, res, next) => {
  try {
    const cars = (await Cars.find({ ownerEmail: req.user.email }).sort({ createdAt: -1, _id: -1 }).toArray()).map(normalizeCar);
    res.json({ success: true, cars, data: cars });
  } catch (error) {
    next(error);
  }
});

app.get('/api/cars/my-cars', verifyToken, async (req, res, next) => {
  try {
    const email = req.query.email || req.user.email;
    if (email !== req.user.email) return res.status(403).json({ success: false, message: 'Forbidden access. Email mismatch.' });
    const cars = (await Cars.find({ ownerEmail: email }).sort({ createdAt: -1, _id: -1 }).toArray()).map(normalizeCar);
    res.json({ success: true, cars, data: cars });
  } catch (error) {
    next(error);
  }
});

app.get('/api/cars/:id', async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid car id.' });
    const car = normalizeCar(await Cars.findOne({ _id: new ObjectId(req.params.id) }));
    if (!car) return res.status(404).json({ success: false, message: 'Car not found.' });
    res.json({ success: true, car, data: car });
  } catch (error) {
    next(error);
  }
});

app.post('/api/cars', verifyToken, async (req, res, next) => {
  try {
    const newCar = carToDb(req.body, req.user);
    const required = ['carName', 'dailyRentPrice', 'carType', 'imageUrl', 'seatCapacity', 'pickupLocation', 'description', 'ownerEmail'];
    const missing = required.find((key) => newCar[key] === undefined || newCar[key] === '' || Number.isNaN(newCar[key]));
    if (missing) return res.status(400).json({ success: false, message: `${missing} is required.` });
    if (newCar.ownerEmail !== req.user.email) return res.status(403).json({ success: false, message: 'You can add cars only from your own account.' });

    const result = await Cars.insertOne(newCar);
    res.status(201).json({ success: true, message: 'Car added successfully.', insertedId: result.insertedId, car: normalizeCar({ ...newCar, _id: result.insertedId }) });
  } catch (error) {
    next(error);
  }
});

async function updateCarHandler(req, res, next) {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid car id.' });
    const existing = await Cars.findOne({ _id: new ObjectId(req.params.id) });
    if (!existing) return res.status(404).json({ success: false, message: 'Car not found.' });
    if (existing.ownerEmail !== req.user.email) return res.status(403).json({ success: false, message: 'You can update only your own car.' });

    const mapped = carToDb({ ...existing, ...req.body }, req.user);
    delete mapped.createdAt;
    mapped.booking_count = existing.booking_count || 0;
    const update = {
      carName: mapped.carName,
      dailyRentPrice: mapped.dailyRentPrice,
      carType: mapped.carType,
      imageUrl: mapped.imageUrl,
      seatCapacity: mapped.seatCapacity,
      pickupLocation: mapped.pickupLocation,
      description: mapped.description,
      availabilityStatus: mapped.availabilityStatus,
      updatedAt: new Date().toISOString(),
    };
    const result = await Cars.updateOne({ _id: new ObjectId(req.params.id) }, { $set: update });
    res.json({ success: true, message: 'Car updated successfully.', modifiedCount: result.modifiedCount });
  } catch (error) {
    next(error);
  }
}

app.put('/api/cars/:id', verifyToken, updateCarHandler);
app.patch('/api/cars/:id', verifyToken, updateCarHandler);

app.delete('/api/cars/:id', verifyToken, async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid car id.' });
    const existing = await Cars.findOne({ _id: new ObjectId(req.params.id) });
    if (!existing) return res.status(404).json({ success: false, message: 'Car not found.' });
    if (existing.ownerEmail !== req.user.email) return res.status(403).json({ success: false, message: 'You can delete only your own car.' });
    const result = await Cars.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true, message: 'Car deleted successfully.', deletedCount: result.deletedCount });
  } catch (error) {
    next(error);
  }
});

app.post('/api/bookings', verifyToken, async (req, res, next) => {
  try {
    const { carId, driverNeeded = 'No', specialNote = '', userEmail, userName } = req.body;
    if (!carId) return res.status(400).json({ success: false, message: 'carId is required.' });
    if (!isValidId(carId)) return res.status(400).json({ success: false, message: 'Invalid car id.' });
    if (userEmail && userEmail !== req.user.email) return res.status(403).json({ success: false, message: 'You can book only from your own account.' });

    const car = normalizeCar(await Cars.findOne({ _id: new ObjectId(carId) }));
    if (!car) return res.status(404).json({ success: false, message: 'Car not found.' });
    if (!car.available) return res.status(400).json({ success: false, message: 'This car is currently unavailable.' });

    const booking = {
      carId,
      carName: car.name,
      carImage: car.image,
      carType: car.type,
      pickupLocation: car.location,
      dailyRentPrice: Number(car.price),
      totalPrice: Number(car.price),
      userEmail: req.user.email,
      userName: userName || req.user.name || '',
      ownerEmail: car.ownerEmail,
      driverNeeded,
      specialNote,
      bookingDate: new Date().toISOString(),
      status: 'Confirmed',
      createdAt: new Date().toISOString(),
    };

    const result = await Bookings.insertOne(booking);
    await Cars.updateOne({ _id: new ObjectId(carId) }, { $inc: { booking_count: 1 } });
    res.status(201).json({ success: true, message: 'Booking confirmed successfully.', insertedId: result.insertedId, booking });
  } catch (error) {
    next(error);
  }
});

app.get('/api/bookings/my', verifyToken, async (req, res, next) => {
  try {
    const bookings = await Bookings.find({ userEmail: req.user.email }).sort({ createdAt: -1, bookingDate: -1 }).toArray();
    res.json({ success: true, bookings, data: bookings });
  } catch (error) {
    next(error);
  }
});

app.get('/api/bookings', verifyToken, async (req, res, next) => {
  try {
    const email = req.query.email || req.user.email;
    if (email !== req.user.email) return res.status(403).json({ success: false, message: 'Forbidden access. Email mismatch.' });
    const bookings = await Bookings.find({ userEmail: email }).sort({ createdAt: -1, bookingDate: -1 }).toArray();
    res.json({ success: true, bookings, data: bookings });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/bookings/:id', verifyToken, async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid booking id.' });
    const booking = await Bookings.findOne({ _id: new ObjectId(req.params.id) });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
    if (booking.userEmail !== req.user.email) return res.status(403).json({ success: false, message: 'You can delete only your own booking.' });
    const result = await Bookings.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true, message: 'Booking cancelled successfully.', deletedCount: result.deletedCount });
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: `API route not found: ${req.method} ${req.originalUrl}` });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ success: false, message: 'Internal server error.', error: error.message });
});

async function startServer() {
  await client.connect();
  db = client.db(dbName);
  Cars = db.collection(carsCollectionName);
  Bookings = db.collection(bookingsCollectionName);
  console.log(`MongoDB connected: ${dbName}`);
  app.listen(port, () => console.log(`DriveFleet server listening on port ${port}`));
}

startServer().catch((error) => {
  console.error('Failed to start server:', error.message);
  process.exit(1);
});
