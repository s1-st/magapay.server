const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const mongoose = require("mongoose");

const app = express();

app.use(cors());
app.use(express.json());

/* =========================
   MONGODB CONNECTION
========================= */
mongoose.connect(process.env.MONGO_URL)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

/* =========================
   USER MODEL
========================= */
const userSchema = new mongoose.Schema({
  name: String,
  phone: String,
  email: String,
  password: String,
  balance: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const User = mongoose.model("User", userSchema);

/* =========================
   TRANSACTION MODEL
========================= */
const transactionSchema = new mongoose.Schema({
  msisdn: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  reference: {
    type: String,
    default: ""
  },
  status: {
    type: String,
    default: "SUCCESS"
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Transaction = mongoose.model("Transaction", transactionSchema);

/* =========================
   HOME
========================= */
app.get("/", (req, res) => {
  res.send("MegaPay server is running");
});

/* =========================
   SIGNUP
========================= */
app.post("/signup", async (req, res) => {
  try {
    const { name, phone, email, password } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.json({ success: false, message: "User already exists" });
    }

    await User.create({ name, phone, email, password });

    res.json({ success: true, message: "Account created successfully" });

  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* =========================
   LOGIN
========================= */
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email, password });

    if (!user) {
      return res.json({ success: false, message: "Invalid credentials" });
    }

    res.json({
      success: true,
      message: "Login successful",
      name: user.name,
      phone: user.phone,
      email: user.email
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* =========================
   GET USER
========================= */
app.get("/user", async (req, res) => {
  try {
    const email = req.query.email;

    if (!email) {
      return res.status(400).json({
        error: "Email required"
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    res.json({
      name: user.name,
      email: user.email,
      phone: user.phone,
      balance: user.balance || 0
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Server error"
    });
  }
});
/* =========================
   STK PUSH
========================= */
app.post("/stkpush", async (req, res) => {
  try {
    const { msisdn, amount, reference } = req.body;

    const response = await fetch(
      "https://megapay.co.ke/backend/v1/initiatestk",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
       body: JSON.stringify({
  api_key: process.env.MEGAPAY_API_KEY,
  email: process.env.MEGAPAY_EMAIL,
  msisdn,
  amount,
  reference,
  account_name: "CASHNEST",
  callback_url: "https://megapay-server.onrender.com/stk-callback"
})
      }
    );

    const data = await response.json();
    res.json(data);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   CALLBACK
========================= */
app.post("/stk-callback", async (req, res) => {
  try {
    const data = req.body;

    console.log("Webhook received:", JSON.stringify(data, null, 2));

    const transaction = await Transaction.create({
      msisdn: data.msisdn || data.phone || "",
      amount: Number(data.amount || 0),
      reference: data.reference || data.transaction_id || "",
      status: data.status || "SUCCESS"
    });

    console.log("Transaction saved:", transaction._id);

    res.status(200).json({
      success: true,
      message: "Transaction saved"
    });

  } catch (err) {
    console.error("Callback Error:", err);

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/* =========================
   TRANSACTIONS
========================= */
app.get("/transactions/:msisdn", async (req, res) => {
  try {
    const data = await Transaction.find({ msisdn: req.params.msisdn });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on", PORT);
});
