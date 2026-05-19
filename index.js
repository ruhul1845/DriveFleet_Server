const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { MongoClient, ObjectId, ServerApiVersion } = require('mongodb');
const compression = require('compression');
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

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const client = new MongoClient(mongoUri, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 8000,
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let Cars;
let Bookings;
let dbReadyPromise = null;
let indexesEnsured = false;

const LIST_CACHE = 'public, s-maxage=30, stale-while-revalidate=120';

/** Reuse one MongoDB connection per Vercel instance (avoids ~3–8s connect on every cold start). */
async function connectDB() {
  if (Cars && Bookings) return { Cars, Bookings };
  if (!dbReadyPromise) {
    dbReadyPromise = (async () => {
      await client.connect();
      const db = client.db(dbName);
      Cars = db.collection(carsCollectionName);
      Bookings = db.collection(bookingsCollectionName);
      if (!indexesEnsured) {
        indexesEnsured = true;
        ensureIndexes().catch((err) => console.error('Index setup:', err.message));
      }
      return { Cars, Bookings };
    })().catch((err) => {
      dbReadyPromise = null;
      throw err;
    });
  }
  return dbReadyPromise;
}

async function ensureIndexes() {
  await Cars.createIndexes([
    { key: { createdAt: -1, _id: -1 } },
    { key: { carType: 1 } },
    { key: { ownerEmail: 1 } },
    { key: { carName: 1 } },
  ]);
  await Bookings.createIndexes([{ key: { userEmail: 1, createdAt: -1 } }]);
}

async function dbMiddleware(req, res, next) {
  try {
    await connectDB();
    next();
  } catch (error) {
    next(error);
  }
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

app.get('/', (req, res) => {
  res.send('DriveFleet server is running.');
});

// Performance monitoring middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 100) {
      console.log(`[SLOW] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
    }
  });
  next();
});

app.get('/api/health', async (req, res) => {
  try {
    await connectDB();
    res.json({ success: true, message: 'DriveFleet API is healthy.' });
  } catch (error) {
    res.status(503).json({ success: false, message: 'Database unavailable.', error: error.message });
  }
});

app.use(dbMiddleware);

const sampleCars = [
  {
    carName: 'Toyota Corolla Hybrid', dailyRentPrice: 65, carType: 'Sedan', imageUrl: 'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?auto=format&fit=crop&w=1200&q=80', seatCapacity: 5, pickupLocation: 'Dhaka Airport', description: 'Fuel efficient sedan for city rides, office trips, and airport pickup.', availabilityStatus: 'Available', booking_count: 0, ownerEmail: 'admin@drivefleet.com', ownerName: 'DriveFleet Admin'
  },
  {
    carName: 'Honda CR-V Touring', dailyRentPrice: 95, carType: 'SUV', imageUrl: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1200&q=80', seatCapacity: 5, pickupLocation: 'Gulshan, Dhaka', description: 'Comfortable SUV with spacious luggage area for family and business travel.', availabilityStatus: 'Available', booking_count: 0, ownerEmail: 'admin@drivefleet.com', ownerName: 'DriveFleet Admin'
  },
  {
    carName: 'BMW 5 Series Executive', dailyRentPrice: 180, carType: 'Luxury', imageUrl: 'https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=1200&q=80', seatCapacity: 5, pickupLocation: 'Banani, Dhaka', description: 'Premium luxury car for weddings, business meetings, and VIP travel.', availabilityStatus: 'Available', booking_count: 0, ownerEmail: 'admin@drivefleet.com', ownerName: 'DriveFleet Admin'
  },
  {
    carName: 'Hyundai Tucson Smart', dailyRentPrice: 85, carType: 'SUV', imageUrl: 'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=1200&q=80', seatCapacity: 5, pickupLocation: 'Uttara, Dhaka', description: 'Modern SUV with smooth handling and strong air conditioning.', availabilityStatus: 'Available', booking_count: 0, ownerEmail: 'admin@drivefleet.com', ownerName: 'DriveFleet Admin'
  },
  {
    carName: 'Suzuki Swift City', dailyRentPrice: 45, carType: 'Hatchback', imageUrl: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80', seatCapacity: 4, pickupLocation: 'Mirpur, Dhaka', description: 'Affordable hatchback for students, short trips, and daily commute.', availabilityStatus: 'Available', booking_count: 0, ownerEmail: 'admin@drivefleet.com', ownerName: 'DriveFleet Admin'
  },
  {
    carName: 'Mercedes-Benz C Class', dailyRentPrice: 170, carType: 'Luxury', imageUrl: 'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=1200&q=80', seatCapacity: 5, pickupLocation: 'Dhanmondi, Dhaka', description: 'Elegant luxury vehicle with premium comfort and professional look.', availabilityStatus: 'Unavailable', booking_count: 0, ownerEmail: 'admin@drivefleet.com', ownerName: 'DriveFleet Admin'
  },
  {
    carName: 'Nissan X-Trail 2020', dailyRentPrice: 75, carType: 'SUV', imageUrl: 'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=1200&q=80', seatCapacity: 7, pickupLocation: 'Banani, Dhaka', description: 'A spacious SUV perfect for family tours, highway journeys, and comfortable group travel.', availabilityStatus: 'Available', booking_count: 0, ownerEmail: 'admin@drivefleet.com', ownerName: 'DriveFleet Admin'
  },
  {
    carName: 'Toyota Hiace 2019', dailyRentPrice: 95, carType: 'Microbus', imageUrl: 'https://images.unsplash.com/photo-1549927681-0b673b8243ab?auto=format&fit=crop&w=1200&q=80', seatCapacity: 12, pickupLocation: 'Mohakhali, Dhaka', description: 'Reliable microbus for group tours, office trips, airport pickup, and long-distance travel.', availabilityStatus: 'Available', booking_count: 0, ownerEmail: 'admin@drivefleet.com', ownerName: 'DriveFleet Admin'
  }
];

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
  // TEMPORARILY COMMENTED OUT FOR TESTING PURPOSES
  const token = req.cookies?.drivefleet_token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, message: 'Unauthorized access. Token missing.' });

  jwt.verify(token, jwtSecret, (error, decoded) => {
    if (error) return res.status(403).json({ success: false, message: 'Forbidden access. Invalid token.' });
    req.user = decoded;
    next();
  });

  // Mock user for testing
  req.user = { email: req.body.userEmail || 'test@example.com', name: 'Test User' };
  next();
}



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
    .json({ success: true, message: 'JWT token created successfully.', token });
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
    const { search = '', type = '', limit = '12' } = req.query;
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

    let cursor = Cars.find(query)
      .project({ carName: 1, dailyRentPrice: 1, carType: 1, imageUrl: 1, seatCapacity: 1, pickupLocation: 1, availabilityStatus: 1, ownerEmail: 1, booking_count: 1, createdAt: 1, _id: 1 })
      .sort({ createdAt: -1, _id: -1 });
    const parsedLimit = Math.min(Number(limit) || 12, 100);
    if (parsedLimit > 0) cursor = cursor.limit(parsedLimit);

    const cars = (await cursor.toArray()).map(normalizeCar);
    if (!search && !type) res.set('Cache-Control', LIST_CACHE);
    res.json({ success: true, cars, data: cars });
  } catch (error) {
    next(error);
  }
});

app.get('/api/cars/featured', async (req, res, next) => {
  try {
    const cars = (await Cars.find({})
      .project({ carName: 1, dailyRentPrice: 1, carType: 1, imageUrl: 1, seatCapacity: 1, pickupLocation: 1, availabilityStatus: 1, ownerEmail: 1, booking_count: 1, createdAt: 1, _id: 1 })
      .sort({ createdAt: -1, _id: -1 })
      .limit(6)
      .toArray()).map(normalizeCar);
    res.set('Cache-Control', LIST_CACHE);
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

module.exports = app;

if (!process.env.VERCEL) {
  connectDB()
    .then(() => {
      console.log(`MongoDB connected: ${dbName}`);
      app.listen(port, () => console.log(`DriveFleet server listening on port ${port}`));
    })
    .catch((error) => {
      console.error('Failed to start server:', error.message);
      process.exit(1);
    });
}
