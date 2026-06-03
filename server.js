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
   TRANSACTION MODEL
========================= */
const transactionSchema = new mongoose.Schema({
  msisdn: String,
  amount: Number,
  reference: String,
  status: String,
  createdAt: { type: Date, default: Date.now }
});

const Transaction = mongoose.model("Transaction", transactionSchema);

/* =========================
   HOME ROUTE
========================= */
app.get("/", (req, res) => {
  res.send("MegaPay server is running");
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
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          api_key: process.env.MEGAPAY_API_KEY,
          email: process.env.MEGAPAY_EMAIL,
          msisdn,
          amount,
          reference,
          account_name: "CASHNEST"
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
   CALLBACK (IMPORTANT)
========================= */
app.post("/stk-callback", async (req, res) => {
  try {
    const data = req.body;

    console.log("Callback received:", data);

    await Transaction.create({
      msisdn: data.msisdn,
      amount: data.amount,
      reference: data.reference,
      status: "SUCCESS"
    });

    res.json({ message: "Transaction saved" });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   GET TRANSACTIONS
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
