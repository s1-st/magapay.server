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

profit: {
  type: Number,
  default: 0
},

lastProfitDate: {
  type: Date,
  default: Date.now
},
   referrals: {
  type: Number,
  default: 0
},
withdrawReferralExempt: {
  type: Boolean,
  default: false
},   

referredBy: {
  type: String,
  default: null
},

referralCode: {
  type: String,
  default: () => "REF" + Math.floor(100000 + Math.random() * 900000),
  unique: true,
  immutable: true
},
      
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const User = mongoose.model("User", userSchema);
function getProfit(balance) {

if (balance >= 100000)
return { amount: 30000, period: 7 };

if (balance >= 50000)
return { amount: 15000, period: 7 };

if (balance >= 40000)
return { amount: 12000, period: 7 };

if (balance >= 30000)
return { amount: 8500, period: 7 };

if (balance >= 20000)
return { amount: 6000, period: 7 };

if (balance >= 10000)
return { amount: 3000, period: 7 };

if (balance >= 5000)
return { amount: 1500, period: 7 };

if (balance >= 2500)
return { amount: 100, period: 1 };

return { amount: 0, period: 0 };

}
async function updateProfit(user) {

const now = new Date();

const days =
Math.floor(
(now - user.lastProfitDate) /
(1000 * 60 * 60 * 24)
);

const plan =
getProfit(user.balance);

if (plan.amount === 0)
return;

if (days >= plan.period) {

const cycles =
Math.floor(
days / plan.period
);

const earned =
cycles * plan.amount;

user.balance += earned;

user.profit += earned;

user.lastProfitDate =
new Date();

await user.save();

}

}

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

let {
name,
phone,
email,
password,
referredBy
} = req.body;


/* VALIDATION */
if (
!name ||
!phone ||
!email ||
!password
) {
return res.json({
success:false,
message:"All fields required"
});
}


/* CLEAN PHONE */
phone =
phone
.trim()
.replace(/\s/g,"");

if (
phone.startsWith("+")
) {
phone =
phone.substring(1);
}

if (
phone.startsWith("0")
) {
phone =
"254" +
phone.substring(1);
}


/* CLEAN EMAIL */
email =
email
.trim()
.toLowerCase();


/* CHECK EMAIL EXISTS */
const emailExists =
await User.findOne({
email
});

if (
emailExists
) {
return res.json({
success:false,
message:
"User already exists"
});
}


/* CHECK PHONE EXISTS */
const phoneExists =
await User.findOne({
phone
});

if (
phoneExists
) {
return res.json({
success:false,
message:
"Phone already exists"
});
}


/* FIND REFERRER */
let referrer = null;

if(referredBy){

referrer =
await User.findOne({
referralCode:
referredBy
});

/* PREVENT SELF REFERRAL */

if(
referrer &&
referrer.email === email
){

return res.json({
success:false,
message:
"You cannot refer yourself"
});

}

}


/* GENERATE REFERRAL CODE */
const referralCode =
Math.random()
.toString(36)
.substring(2,8)
.toUpperCase();


/* CREATE USER */
const user =
await User.create({

name:
name.trim(),

phone,

email,

password,

balance:0,

profit:0,

referrals:0,

referralCode,

referredBy:
referrer
? referrer.referralCode
: null

});


/* UPDATE REFERRER */
if(referrer){

await User.updateOne(
{
_id:
referrer._id
},
{
$inc:{
referrals:1
}
}
);

}

return res.json({

success:true,

message:
"Account created successfully",

user:{

name:
user.name,

email:
user.email,

phone:
user.phone,

balance:
user.balance,

profit:
user.profit,

referralCode:
user.referralCode

}

});

}catch(err){

console.log(
"SIGNUP ERROR:",
err
);

return res
.status(500)
.json({

success:false,

message:
"Server error"

});

}

});


/* =========================
   LOGIN
========================= */
app.post("/login", async (req, res) => {

try {

let {
email,
password
} = req.body;


/* CLEAN EMAIL */
email =
email
.trim()
.toLowerCase();


const user =
await User.findOne({

email,
password

});


if (
!user
) {

return res.json({

success:false,

message:
"Invalid credentials"

});

}


return res.json({

success:true,

message:
"Login successful",

user:{

name:
user.name,

email:
user.email,

phone:
user.phone,

balance:
user.balance || 0,

profit:
user.profit || 0,

referralCode:
user.referralCode

}

});

}catch(err){

console.log(
"LOGIN ERROR:",
err
);

return res
.status(500)
.json({

success:false,

message:
"Server error"

});

}

});


/* =========================
   GET USER
========================= */
/* MATCHES fetch("/api/user") */
app.get("/api/user", async (req, res) => {

try {

let email =
req.query.email;


if (
!email
) {

return res
.status(400)
.json({

success:false,

message:
"Email required"

});

}


email =
email
.trim()
.toLowerCase();


const user =
await User.findOne({
email
});


if (
!user
) {

return res
.status(404)
.json({

success:false,

message:
"User not found"

});

}


return res.json({

success:true,

name:
user.name,

email:
user.email,

phone:
user.phone,

balance:
user.balance || 0,

profit:
user.profit || 0,

referrals:
user.referrals || 0,

referralCode:
user.referralCode

});

}catch(err){

console.log(
"GET USER ERROR:",
err
);

return res
.status(500)
.json({

success:false,

message:
"Server error"

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

try{

let {
email,
name,
phone,
referralCode
} = req.body;


/* VALIDATE */

if(!email){

return res.json({

success:false,

message:
"Email required"

});

}


/* CLEAN EMAIL */

email =
email
.trim()
.toLowerCase();


/* CLEAN PHONE */

if(phone){

phone =
phone
.trim()
.replace(
/\s/g,
""
);

if(
phone.startsWith("+")
){

phone =
phone.substring(1);

}

if(
phone.startsWith("0")
){

phone =
"254" +
phone.substring(1);

}

}


/* FIND USER */

const user =
await User.findOne({
email
});


if(!user){

return res.json({

success:false,

message:
"User not found"

});

}


/* UPDATE */

if(name)
user.name =
name.trim();

if(phone)
user.phone =
phone;

if(
referralCode
){

user.referralCode =
referralCode
.trim();

}


await user.save();


return res.json({

success:true,

message:
"Profile updated successfully",

user:{

name:
user.name,

email:
user.email,

phone:
user.phone,

referralCode:
user.referralCode

}

});

}
catch(err){

console.log(
"UPDATE PROFILE ERROR:",
err
);

return res
.status(500)
.json({

success:false,

message:
"Failed to update profile"

});

}

});
app.post("/withdraw", async (req, res) => {

try {

const { email, amount } = req.body;

const user =
await User.findOne({ email });

if (!user) {
return res.json({
success:false,
message:"User not found"
});
}

const amt =
Number(amount);

if (amt <= 0) {
return res.json({
success:false,
message:"Invalid amount"
});
}

/* REFERRAL CHECK FIRST */
if (
Number(user.referrals || 0) < 3 &&
user.withdrawReferralExempt !== true
) {

return res.json({
success:false,
redirect:"referrals",
message:"You need at least 3 referrals to withdraw"
});

}

/* CHECK PROFIT */
if (
Number(user.profit || 0) < amt
) {

return res.json({
success:false,
message:"Insufficient profit available"
});

}

/* DEDUCT PROFIT ONLY */
user.profit =
Number(user.profit || 0)
- amt;

await user.save();

/* SAVE REQUEST */
await Transaction.create({

msisdn:user.phone,

amount:amt,

type:"WITHDRAW",

reference:
"WD" + Date.now(),

status:"PENDING",

balanceAfter:
user.profit

});

res.json({

success:true,

message:
"Withdrawal request submitted for approval"

});

} catch(err){

res.status(500).json({
error:err.message
});

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

app.post("/admin/adjust-profit", adminAuth, async (req, res) => {

try {

const { email, amount } = req.body;

const user =
await User.findOne({ email });

if (!user) {
return res.status(404).json({
error: "User not found"
});
}

const profitChange =
Number(amount);

user.profit =
Number(user.profit || 0)
+ profitChange;

if (user.profit < 0) {
user.profit = 0;
}

await user.save();

await AdminLog.create({
admin: "MAIN_ADMIN",
action:
profitChange >= 0
? "ADD_PROFIT"
: "DEDUCT_PROFIT",
email,
amount: profitChange,
balanceAfter: user.balance
});

res.json({
success: true,
profit: user.profit
});

}

catch(err){

console.log(err);

res.status(500).json({
error: err.message
});

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
app.get("/admin/withdrawals", adminAuth, async (req, res) => {

try {

const data = await Transaction.find({
type: "WITHDRAW"
}).sort({ createdAt: -1 });

res.json(data);

} catch (err) {
res.status(500).json({ error: err.message });
}

});
app.post(
"/admin/approve-withdrawal",
adminAuth,
async (req,res)=>{

try{

const { reference } =
req.body;

console.log("APPROVE CALLED:", reference);

const tx =
await Transaction.findOne({
reference
});

if(!tx){
return res.json({
success:false,
message:"Transaction not found"
});
}

if(
tx.status ===
"SUCCESS"
){
return res.json({
success:false,
message:"Already approved"
});
}

const user =
await User.findOne({
phone:tx.msisdn
});

if(!user){
return res.json({
success:false,
message:"User not found"
});
}

/* APPROVE */
tx.status =
"SUCCESS";

tx.balanceAfter =
user.profit;

await tx.save();

res.json({
success:true,
message:
"Withdrawal approved"
});

}catch(err){

res.status(500).json({
error:err.message
});

}

});
app.post(
"/admin/reject-withdraw",
adminAuth,
async (req,res)=>{

try{

const tx =
await Transaction.findOne({
reference:req.body.reference
});

if(!tx){
return res.status(404).json({
error:"Transaction not found"
});
}

/* PREVENT DOUBLE RESTORE */
if(
tx.status === "REJECTED"
){
return res.json({
success:false,
message:"Already rejected"
});
}

/* FIND USER */
const user =
await User.findOne({
phone:tx.msisdn
});

if(!user){
return res.status(404).json({
error:"User not found"
});
}

/* RESTORE PROFIT */
user.profit =
Number(user.profit || 0)
+
Number(tx.amount);

await user.save();

/* MARK REJECTED */
tx.status =
"REJECTED";

tx.balanceAfter =
user.profit;

await tx.save();

res.json({
success:true,
message:
"Withdrawal rejected and profit restored"
});

}catch(err){

res.status(500).json({
error:err.message
});

}

});
app.post(
"/admin/allow-withdraw",
adminAuth,
async (req,res)=>{

try{

const { email } = req.body;

const user =
await User.findOne({ email });

if(!user){
return res.status(404).json({
error:"User not found"
});
}

user.withdrawReferralExempt = true;

await user.save();

res.json({
success:true,
message:"Withdraw restriction removed"
});

}catch(err){

res.status(500).json({
error:err.message
});

}

});
app.post(
"/admin/restore-withdraw-rule",
adminAuth,
async(req,res)=>{

const user =
await User.findOne({
email:req.body.email
});

user.withdrawReferralExempt=false;

await user.save();

res.json({
success:true
});

});

app.get("/admin/withdrawal-analytics", adminAuth, async (req, res) => {

try {

const startOfDay = new Date();
startOfDay.setHours(0, 0, 0, 0);

const endOfDay = new Date();
endOfDay.setHours(23, 59, 59, 999);

// ALL withdrawals today
const all = await Transaction.find({
type: "WITHDRAW",
createdAt: { $gte: startOfDay, $lte: endOfDay }
});

// group stats
let totalRequests = all.length;
let totalAmount = 0;
let pending = 0;
let approved = 0;
let rejected = 0;

all.forEach(tx => {

totalAmount += tx.amount;

if (tx.status === "PENDING") pending++;
if (tx.status === "SUCCESS") approved++;
if (tx.status === "REJECTED") rejected++;

});

res.json({
totalRequests,
totalAmount,
pending,
approved,
rejected
});

} catch (err) {

res.status(500).json({
error: err.message
});

}

});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on", PORT);
});
