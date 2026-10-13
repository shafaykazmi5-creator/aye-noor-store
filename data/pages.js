"use strict";

const FAQS = [
  {
    category: "Ordering & Delivery",
    question: "How long does delivery take?",
    answer: "TBD — Dispatch timelines, courier partners, and city-by-city delivery estimates will be published here once store operations are finalized."
  },
  {
    category: "Ordering & Delivery",
    question: "What are the delivery charges?",
    answer: "During development, our prototype uses a placeholder delivery fee of Rs. 250 with free shipping on orders from Rs. 3,000. Final shipping rates will be confirmed before launch."
  },
  {
    category: "Ordering & Delivery",
    question: "Which payment methods do you accept?",
    answer: "Version 1 will support Cash on Delivery (COD) across confirmed delivery areas in Pakistan. Online payment options are planned for Version 2."
  },
  {
    category: "Ordering & Delivery",
    question: "Will I receive a WhatsApp confirmation when I place an order?",
    answer: "Yes. Once our WhatsApp Business integration goes live, you will automatically receive an order confirmation with your order number and item summary on WhatsApp."
  },
  {
    category: "Candles & Care",
    question: "What wax and materials are used in Aye Noor candles?",
    answer: "TBD — Exact wax blends, fragrance notes, and wick specifications will be listed on each product page once final product testing and photography are complete."
  },
  {
    category: "Candles & Care",
    question: "How do I care for sculptural floral and bear candles?",
    answer: "Trim the wick to roughly 5 mm before lighting, place sculptural candles on a heat-safe dish or tray to catch any natural wax drip, and keep away from direct drafts or ceiling fans."
  },
  {
    category: "Gifting & Custom Orders",
    question: "Can I order candles as a gift for someone else?",
    answer: "Yes. Our collection is designed around thoughtful gifting. Gift note and custom candle options (TBD) will be announced once available."
  }
];

const POLICIES = {
  shipping: {
    slug: "shipping",
    eyebrow: "STORE POLICY · TBD BEFORE LAUNCH",
    title: "Shipping Policy",
    updated: "Development Draft (TBD)",
    intro: "This page contains placeholder shipping rules for the Aye Noor development prototype. Final courier partners, delivery cities, and dispatch timelines will be confirmed before launch.",
    sections: [
      {
        heading: "1. Delivery coverage (TBD)",
        body: "Aye Noor plans to deliver across Pakistan. Specific serviceable cities, remote-area surcharges (if any), and local Rawalpindi / Islamabad delivery options are currently TBD."
      },
      {
        heading: "2. Shipping charges (Placeholder)",
        body: "The prototype currently calculates a standard placeholder shipping fee of Rs. 250 per order, with free standard shipping on orders of Rs. 3,000 or above. These figures are configurable in the store settings and will be finalized prior to launch."
      },
      {
        heading: "3. Dispatch & transit times (TBD)",
        body: "Order processing times (especially for handcrafted or made-to-order candles) and estimated courier transit days are TBD and will be clearly stated here once confirmed."
      },
      {
        heading: "4. Order updates",
        body: "Customers will receive an order confirmation once their order is recorded, with automated WhatsApp status updates planned as part of the live store launch."
      }
    ]
  },
  returns: {
    slug: "returns",
    eyebrow: "STORE POLICY · TBD BEFORE LAUNCH",
    title: "Return & Exchange Policy",
    updated: "Development Draft (TBD)",
    intro: "This is a placeholder return and exchange policy for the Aye Noor prototype. No unverified return promises are made here; final terms will be added by the business owner before launch.",
    sections: [
      {
        heading: "1. Return eligibility window (TBD)",
        body: "The exact number of days after delivery within which a customer may request a return or exchange, along with condition requirements (unused, original packaging), is TBD."
      },
      {
        heading: "2. Damaged or incorrect items (TBD)",
        body: "Because candles are fragile, our final policy will outline the exact steps (such as sharing unboxing photos via WhatsApp or email within a set timeframe) to request a replacement if an item arrives damaged in transit."
      },
      {
        heading: "3. Non-returnable items (TBD)",
        body: "Rules regarding used candles, sale items, and custom/personalized candles will be finalized and listed here before launch."
      },
      {
        heading: "4. Refunds & exchanges process (TBD)",
        body: "Whether approved claims are resolved via replacement candle, store credit, or bank transfer refund will be confirmed before live orders begin."
      }
    ]
  },
  privacy: {
    slug: "privacy",
    eyebrow: "LEGAL & PRIVACY · TBD BEFORE LAUNCH",
    title: "Privacy Policy",
    updated: "Development Draft (TBD)",
    intro: "This draft explains what data the Aye Noor website collects to process orders and customer inquiries, and will be finalized with confirmed business contact details before launch.",
    sections: [
      {
        heading: "1. Information we collect",
        body: "When you place an order or submit a contact inquiry, we collect the details needed to fulfill your request—such as your name, phone number, delivery address, city, and order items. In your browser, the shopping cart stores only product SKUs and quantities."
      },
      {
        heading: "2. How we use your information",
        body: "We use your contact and address details strictly to verify, pack, deliver, and support your order, including sending transactional order confirmations via WhatsApp once live notifications are enabled."
      },
      {
        heading: "3. Data protection & third parties",
        body: "We do not sell personal data. Information is shared only with essential service providers required to complete your order (such as delivery couriers and the official WhatsApp Business Platform for order notifications)."
      },
      {
        heading: "4. Contact for privacy requests (TBD)",
        body: "Official email and WhatsApp contact details for data inquiries or deletion requests will be published here once confirmed."
      }
    ]
  },
  terms: {
    slug: "terms",
    eyebrow: "LEGAL & TERMS · TBD BEFORE LAUNCH",
    title: "Terms of Service",
    updated: "Development Draft (TBD)",
    intro: "These provisional terms govern the use of the Aye Noor website prototype. Final commercial terms will be confirmed prior to public launch.",
    sections: [
      {
        heading: "1. Prototype status",
        body: "This website is currently in active development using sample product data and prices. No real commercial transactions are processed until the official launch announcement."
      },
      {
        heading: "2. Pricing & stock verification",
        body: "All prices are listed in Pakistani Rupees (Rs.). Every cart quote and checkout request is re-verified on our server against current active pricing and available inventory before an order is accepted."
      },
      {
        heading: "3. Handcrafted variations",
        body: "Because decorative and scented candles are crafted in batches, slight natural variations in color tint or frost may occur. Only confirmed material claims will be listed on live products."
      },
      {
        heading: "4. Candle safety responsibility",
        body: "Customers agree to follow standard candle safety instructions, including never leaving a lit candle unattended, keeping candles away from children and pets, and placing sculptural candles on a heat-resistant dish."
      }
    ]
  }
};

module.exports = {
  FAQS,
  POLICIES
};
