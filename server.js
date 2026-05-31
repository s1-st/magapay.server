const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();

app.use(cors());
app.use(express.json());

// allow all origins (important for Wix embed)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  next();
});

app.get("/", (req, res) => {
  res.send("MegaPay server is running");
});

app.post("/stkpush", async (req, res) => {
  try {
    const { msisdn, amount, reference } = req.body;

    console.log("Incoming request:", req.body);

    const response = await fetch("https://megapay.co.ke/backend/v1/initiatestk", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        api_key: process.env.MEGAPAY_API_KEY,
        email: process.env.MEGAPAY_EMAIL,
        msisdn,
        amount,
        reference
      })
    });

    const data = await response.json();

    console.log("MegaPay response:", data);

    res.json(data);

  } catch (err) {
    console.log("ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});
