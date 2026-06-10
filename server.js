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

   referrals: {
  type: Number,
  default: 0
},

referredBy: {
  type: String,
  default: null
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

    let { name, phone, email, password, referredBy } = req.body;

    if (!name || !phone || !email || !password) {
      return res.json({
        success: false,
        message: "All fields required"
      });
    }

    phone = phone.trim();
    phone = phone.replace(/\s/g, "");

    if (phone.startsWith("+")) {
      phone = phone.substring(1);
    }

    if (phone.startsWith("0")) {
      phone = "254" + phone.substring(1);
    }

    email = email.trim().toLowerCase();

    const existing = await User.findOne({ email });

    if (existing) {
      return res.json({
        success: false,
        message: "User already exists"
      });
    }

    const user = await User.create({
      name,
      phone,
      email,
      password,
      referredBy: referredBy || null
    });

    if (referredBy) {
      await User.updateOne(
        { referralCode: referredBy },
        { $inc: { referrals: 1 } }
      );
    }

    res.json({
      success: true,
      message: "Account created successfully",
      user
    });

  } catch (err) {
    console.log("SIGNUP ERROR:", err);

    res.status(500).json({
      success: false,
      message: err.message
    });
  }

// IF USER WAS REFERRED → ADD +1 TO REFERRER
if (referredBy) {
  await User.updateOne(
    { referralCode: referredBy },
    { $inc: { referrals: 1 } }
  );
}

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
  callback_url: "https://magapay-server.onrender.com/stk-callback"
})
      }
    );

    const data = await response.json();
     console.log("🔥 STK PUSH RESPONSE:", data);
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

    console.log("STK CALLBACK RECEIVED:", JSON.stringify(data, null, 2));

    /* =========================
       1. EXTRACT CORE FIELDS
    ========================= */

    const msisdn =
      data.Msisdn ||
      data.msisdn ||
      data.phoneNumber ||
      data.phone ||
      data.customer?.phone ||
      data.data?.msisdn;

    const amount = Number(
      data.TransactionAmount ||
      data.amount ||
      data.data?.amount ||
      0
    );

   const reference =
  data.TransactionReceipt ||
  data.TransactionID ||
  data.reference ||
  data.transaction_id ||
  data.transactionId ||
  data.CheckoutRequestID ||
  data.checkoutRequestID ||
  data.data?.reference ||
  data.data?.transaction_id;

    /* =========================
       2. VALIDATION CHECKS
    ========================= */

    if (!msisdn || !amount || amount <= 0 || !reference) {
      console.log("INVALID CALLBACK DATA - SKIPPED");
      return res.json({ success: false, reason: "invalid_data" });
    }

    /* =========================
       3. CHECK PAYMENT SUCCESS
       (ADAPT THIS TO YOUR PROVIDER)
    ========================= */

  const resultCode =
  data.ResponseCode ??
  data.ResultCode ??
  data.resultCode ??
  data.data?.ResponseCode ??
  data.data?.ResultCode;

   const status =
  data.ResponseDescription ||
  data.status ||
  data.Status ||
  data.data?.status;

    const isSuccess =
      resultCode === 0 ||
      resultCode === "0" ||
      status === "SUCCESS" ||
      status === "success";

     console.log("ResponseCode:", data.ResponseCode);
console.log("ResponseDescription:", data.ResponseDescription);
console.log("isSuccess:", isSuccess);

    if (!isSuccess) {
      console.log("PAYMENT FAILED - NOT CREDITING USER");

      // OPTIONAL: log failed transaction
      await Transaction.create({
        msisdn,
        amount,
        reference,
        type: "DEPOSIT",
        status: "FAILED",
        balanceAfter: null
      });

      return res.json({ success: false, reason: "payment_failed" });
    }

    /* =========================
       4. DUPLICATE CHECK
    ========================= */

    const exists = await Transaction.findOne({ reference });

    if (exists) {
      console.log("DUPLICATE TRANSACTION IGNORED:", reference);
      return res.json({ success: true, reason: "duplicate" });
    }

    /* =========================
       5. FIND USER
    ========================= */

    const user = await User.findOne({ phone: msisdn });

    if (!user) {
      console.log("USER NOT FOUND:", msisdn);

      // IMPORTANT: still log transaction for debugging
      await Transaction.create({
        msisdn,
        amount,
        reference,
        type: "DEPOSIT",
        status: "FAILED",
        balanceAfter: null
      });

      return res.json({ success: false, reason: "user_not_found" });
    }

    /* =========================
       6. SAFE BALANCE UPDATE
    ========================= */

    const oldBalance = Number(user.balance || 0);
    const newBalance = oldBalance + amount;

    user.balance = newBalance;
    await user.save();

    /* =========================
       7. SAVE TRANSACTION
    ========================= */

    const tx = await Transaction.create({
      msisdn,
      amount,
      reference,
      type: "DEPOSIT",
      status: "SUCCESS",
      balanceAfter: newBalance
    });

    console.log("TRANSACTION SAVED:", tx._id);
    console.log("BALANCE UPDATED:", oldBalance, "→", newBalance);

    /* =========================
       8. RESPONSE
    ========================= */

    return res.json({ success: true });

  } catch (err) {
    console.error("STK CALLBACK ERROR:", err);

    return res.status(500).json({
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

    console.log("EMAIL:", email);
    console.log("AMOUNT RECEIVED:", amount);

 const user = await User.findOne({ email });

if (!user) {
  return res.status(404).json({ error: "User not found" });
}

const amt = Number(amount);

console.log("FINAL AMOUNT:", amt);
console.log("BEFORE:", user.balance);

user.balance = Number(user.balance || 0) + amt;

console.log("AFTER:", user.balance);

await user.save();
     
    // SAVE ADMIN LOG (FIXED POSITION)
    await AdminLog.create({
      admin: "MAIN_ADMIN",
      action: Number(amount) >= 0 ? "ADD" : "DEDUCT",
      email,
      amount,
      balanceAfter: user.balance
    });

    return res.json({
      success: true,
      newBalance: user.balance
    });

  } catch (err) {
    console.log("ERROR:", err.message);
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

app.get("/referrals/:email", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      referrals: user.referrals || 0,
      required: 4,
      referralCode: user.referralCode
    });

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
