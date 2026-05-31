const express = require("express");

const app = express();

app.get("/", (req, res) => {
  res.send("MegaPay server running");
});

app.listen(process.env.PORT || 3000);
