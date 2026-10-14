"use strict";

/* Central store configuration (placeholders until final business rules are confirmed) */
module.exports = {
  storeName: "Aye Noor",
  currencySymbol: "Rs.",
  shippingFee: 250,
  freeShippingThreshold: 3000,
  paymentMethods: [
    {
      id: "cod",
      label: "Cash on Delivery (COD)",
      description: "Pay in cash when your order is delivered to your doorstep.",
      enabled: true
    },
    {
      id: "online",
      label: "Online Payment / Bank Transfer (Coming in Version 2)",
      description: "Online payments will be enabled after provider verification.",
      enabled: false
    }
  ],
  provinces: [
    "Punjab",
    "Islamabad Capital Territory",
    "Sindh",
    "Khyber Pakhtunkhwa",
    "Balochistan",
    "Gilgit-Baltistan",
    "Azad Jammu & Kashmir"
  ],
  popularCities: [
    "Rawalpindi",
    "Islamabad",
    "Lahore",
    "Karachi",
    "Faisalabad",
    "Multan",
    "Peshawar",
    "Quetta",
    "Sialkot",
    "Gujranwala",
    "Skardu",
    "Abbottabad"
  ]
};
