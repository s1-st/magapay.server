const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const mongoose = require("mongoose");
const ADMIN_KEY = process.env.ADMIN_KEY;

const app = express();

app.use(cors());
app.use(express.json());

app.use(express.static("public"));

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

referralCode: {
  type: String,
  default: () => "REF" + Math.floor(100000 + Math.random() * 900000)
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
  msisdn: { type: String, required: true },
  amount: { type: Number, required: true },

  type: {
    type: String,
    enum: ["DEPOSIT", "WITHDRAW", "INVESTMENT", "REFERRAL"],
    default: "DEPOSIT"
  },

  reference: { type: String, required: true, unique: true },
  status: { type: String, default: "SUCCESS" },

  balanceAfter: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now }
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
  callback_url: "https://magapay-server.onrender.com/stk-callback"
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
      console.log("RAW BODY:", req.body);
      console.log("KEYS:", Object.keys(req.body));
console.log("FULL WEBHOOK:", JSON.stringify(req.body, null, 2));

    const data = req.body;

     console.log("Msisdn field:", data.Msisdn);
      console.log("msisdn field:", data.msisdn);
     
    const msisdn =
      data.Msisdn ||
      data.msisdn ||
      data.phoneNumber ||
      data.phone ||
      data.customer?.phone ||
      data.data?.Msisdn ||
      data.data?.msisdn;
     
   console.log("MSISDN RECEIVED:", msisdn);

    const amount = Number(data.TransactionAmount || data.amount || data.data?.amount || 0);
    console.log("RAW AMOUNT FIELDS:");
    console.log("TransactionAmount:", data.TransactionAmount);
    console.log("amount:", data.amount); 
    console.log("Final amount:", amount);

  const reference =
  data.reference ||
  data.transaction_id ||
  data.transactionId ||
  data.checkoutRequestID ||
  data.id ||
  data.data?.reference ||
  data.data?.transaction_id ||
  data.data?.transactionId ||
  data.data?.id ||
  `AUTO-${Date.now()}`;
     
    if (!reference) {
      console.log("Missing reference");
      return res.json({ skipped: true });
    }

    // 1. CHECK DUPLICATE
    const exists = await Transaction.findOne({ reference });
    if (exists) {
      console.log("Duplicate ignored:", reference);
      return res.json({ duplicate: true });
    }

    // 2. FIND USER
     console.log("looking for user with phone :", msisdn); 
     
    const user = await User.findOne({ phone: msisdn });

    if (!user) {
      console.log("User not found:", msisdn);
      return res.json({ error: "User not found" });
    }

    // 3. UPDATE BALANCE
    console.log("AMOUNT RECEIVED:", amount);
    console.log("CURRENT BALANCE:", user.balance);
     
    user.balance += amount;

    console.log("BALANCE AFTER UPDATE:", user.balance);
     
    await user.save();

    // 4. SAVE TRANSACTION WITH BALANCE SNAPSHOT
    const tx = await Transaction.create({
      msisdn,
      amount,
      reference,
      type: "DEPOSIT",
      status: "SUCCESS",
      balanceAfter: user.balance
    });

    console.log("Transaction saved:", tx._id);
    console.log("New balance:", user.balance);

    res.json({ success: true });

  } catch (err) {
    console.error("Callback error:", err.message);
    res.status(500).json({ error: err.message });
  }
});
/* =========================
   TRANSACTIONS
========================= */
app.get("/transactions/:msisdn", async (req, res) => {
  try {
    const data = await Transaction.find({ msisdn: req.params.msisdn })
      .sort({ createdAt: -1 });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/balance/:phone", async (req, res) => {
  try {
    const user = await User.findOne({ phone: req.params.phone });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      balance: user.balance,
      name: user.name,
      phone: user.phone
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/db-count", async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    const transactionCount = await Transaction.countDocuments();

    res.json({
      users: userCount,
      transactions: transactionCount
    });

  } catch (err) {
    console.log("DB COUNT ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/update-profile", async (req, res) => {
  try {
    const { email, name, phone, referralCode } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    user.name = name;
    user.phone = phone;
    user.referralCode = referralCode;

    await user.save();

    res.json({ success: true, message: "Profile updated successfully" });

  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

function adminAuth(req, res, next) {
  if (req.headers["x-admin-key"] !== ADMIN_KEY) {
    return res.status(403).json({ error: "Unauthorized Admin Access" });
  }
  next();
}

app.get("/admin/stats", adminAuth, async (req, res) => {
  try {
    const users = await User.countDocuments();
    const transactions = await Transaction.countDocuments();

    const deposits = await Transaction.aggregate([
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    const totalBalance = await User.aggregate([
      { $group: { _id: null, total: { $sum: "$balance" } } }
    ]);

    res.json({
      users,
      transactions,
      totalDeposits: deposits[0]?.total || 0,
      totalBalance: totalBalance[0]?.total || 0
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/admin/users", adminAuth, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/admin/user", adminAuth, async (req, res) => {
  try {
    const search = req.query.search;

    const user = await User.findOne({
      $or: [
        { email: search },
        { phone: search }
      ]
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/admin/adjust-balance", adminAuth, async (req, res) => {
  try {
    const { email, amount } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.balance += Number(amount);

    if (user.balance < 0) user.balance = 0;

    await user.save();

    await Transaction.create({
      msisdn: user.phone,
      amount: Math.abs(Number(amount)),
      reference: "ADMIN-" + Date.now(),
      type: Number(amount) >= 0 ? "DEPOSIT" : "WITHDRAW",
      status: "SUCCESS",
      balanceAfter: user.balance
    });

     await AdminLog.create({
  admin: "MAIN_ADMIN",
  action: Number(amount) >= 0 ? "ADD" : "DEDUCT",
  email,
  amount,
  balanceAfter: user.balance
});

    res.json({
      success: true,
      newBalance: user.balance
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/admin/transactions", adminAuth, async (req, res) => {
  try {
    const tx = await Transaction.find().sort({ createdAt: -1 });
    res.json(tx);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const adminLogSchema = new mongoose.Schema({
  admin: String,
  action: String,
  email: String,
  amount: Number,
  balanceAfter: Number,
  createdAt: { type: Date, default: Date.now }
});

const AdminLog = mongoose.model("AdminLog", adminLogSchema);

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on", PORT);
});
