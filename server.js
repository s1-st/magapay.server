const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("MegaPay server is running");
});

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
          reference
        })
      }
    );

    const data = await response.json();
    res.json(data);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on", PORT));
