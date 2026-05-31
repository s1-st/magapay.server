const express = require("express");
const fetch = require("node-fetch");

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("MegaPay server is running");
});

app.post("/stkpush", async (req, res) => {
  try {
    const { amount, msisdn, reference } = req.body;

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
          amount,
          msisdn,
          reference
        })
      }
    );

    const data = await response.json();
    res.json(data);

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

app.listen(process.env.PORT || 3000);
