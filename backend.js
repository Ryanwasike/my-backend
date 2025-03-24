require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const fs = require("fs");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
const serviceAccountPath = "./Vaacay.json";
if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    if (!admin.apps.length) {
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
} else {
    console.error("Firebase service account JSON file is missing!");
}

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(express.json());
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));

// Connect to MongoDB
const mongoURI = process.env.MONGO_URI;
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("MongoDB Connected"))
    .catch((err) => {
        console.error("MongoDB Connection Error:", err.message);
        process.exit(1);
    });

// Mongoose Schemas & Models
const UserSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const User = mongoose.model("User", UserSchema);

const TripSchema = new mongoose.Schema({
    name: { type: String, required: true },
    date: { type: Date, required: true },
    budget: { type: Number, required: true }
});
const Trip = mongoose.model("Trip", TripSchema);

const NotificationSchema = new mongoose.Schema({
    message: { type: String, required: true },
    type: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
const Notification = mongoose.model("Notification", NotificationSchema);

// User Authentication APIs
app.post("/signup", async (req, res) => {
    try {
        const { firstName, lastName, email, password } = req.body;
        if (!firstName || !lastName || !email || !password) {
            return res.status(400).json({ error: "All fields are required" });
        }
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: "Email already registered" });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ firstName, lastName, email, password: hashedPassword });
        await newUser.save();
        res.status(201).json({ message: "User registered successfully!" });
    } catch (error) {
        res.status(500).json({ error: "Error adding user", details: error.message });
    }
});

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: "User not found" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

        const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "1h" });
        res.json({ message: "Login successful!", token });
    } catch (error) {
        res.status(500).json({ error: "Server error", details: error.message });
    }
});

// Configure Nodemailer transporter
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Password Reset API
app.post('/reset-password', async (req, res) => {
    try {
        const { email } = req.body;
        const link = await admin.auth().generatePasswordResetLink(email);
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Password Reset',
            text: `Click the following link to reset your password: ${link}`
        });
        res.status(200).json({ message: 'Password reset email sent!', link });
    } catch (error) {
        res.status(500).json({ error: 'Failed to send reset email' });
    }
});

// Trip APIs
app.post("/trip/add", async (req, res) => {
    try {
        const { name, date, budget } = req.body;
        if (!name || !date || !budget) return res.status(400).json({ error: "All fields are required" });
        const newTrip = new Trip({ name, date, budget });
        await newTrip.save();
        res.status(201).json({ message: "Trip added successfully!", trip: newTrip });
    } catch (error) {
        res.status(500).json({ error: "Error adding trip" });
    }
});

app.get("/trip", async (req, res) => {
    try {
        const trips = await Trip.find().sort({ date: 1 });
        res.json(trips);
    } catch (error) {
        res.status(500).json({ error: "Error fetching trips" });
    }
});

app.delete("/trip/delete/:id", async (req, res) => {
    try {
        await Trip.findByIdAndDelete(req.params.id);
        res.json({ message: "Trip deleted successfully!" });
    } catch (error) {
        res.status(500).json({ error: "Error deleting trip" });
    }
});

// Notification APIs
app.post("/notification/add", async (req, res) => {
    try {
        const { message, type } = req.body;
        if (!message || !type) return res.status(400).json({ error: "Message and type are required" });

        const newNotification = new Notification({ message, type });
        await newNotification.save();
        res.status(201).json({ message: "Notification added successfully!", notification: newNotification });
    } catch (error) {
        res.status(500).json({ error: "Error adding notification", details: error.message });
    }
});

app.get("/notification", async (req, res) => {
    try {
        const notifications = await Notification.find().sort({ createdAt: -1 });
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ error: "Error fetching notifications" });
    }
});

app.delete("/notification/delete/:id", async (req, res) => {
    try {
        await Notification.findByIdAndDelete(req.params.id);
        res.json({ message: "Notification deleted successfully!" });
    } catch (error) {
        res.status(500).json({ error: "Error deleting notification" });
    }
});

// Start Server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));