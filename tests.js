// activity-upgrades-server.js - Complete payment server with email receipt functionality
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.kenyaonabudgetsafaris.co.uk';
// Load environment variables
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const fs = require('fs');
const nodemailer = require('nodemailer');
const SibApiV3Sdk = require('sib-api-v3-sdk');
const QRCode = require('qrcode');

// Import receipt generator and email functionality
//const { generateReceiptHtml } = require('./receipt-generator');
//const { sendReceiptEmails } = require('./brevo-integration');
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const { generateReceiptHtml } = require('./receipt-generator');
const { 
  sendEmailWithBrevoApi, 
  sendReceiptEmails, 
  sendReceiptEmail, 
  sendAdminNotification 
} = require('./brevo-integration');

// Verify the functions were imported correctly
console.log('Email functions imported:', {
  generateReceiptHtml: typeof generateReceiptHtml === 'function',
  sendEmailWithBrevoApi: typeof sendEmailWithBrevoApi === 'function',
  sendReceiptEmails: typeof sendReceiptEmails === 'function', 
  sendReceiptEmail: typeof sendReceiptEmail === 'function',
  sendAdminNotification: typeof sendAdminNotification === 'function'
});

// Create .env file template for configuration if it doesn't exist
if (!fs.existsSync('.env')) {
  fs.writeFileSync('.env', 
`# Stripe API Keys
STRIPE_SECRET_KEY=sk_test_your_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_key

# Brevo Email Service
BREVO_API_KEY=your_brevo_api_key
BREVO_SMTP_USER=your_brevo_smtp_user
BREVO_SMTP_PASSWORD=your_brevo_smtp_password

# Server Configuration
PORT=3000
SERVER_URL=http://localhost:3000

# Admin Emails for Notifications
ADMIN_EMAILS=admin1@example.com,admin2@example.com
`);
  console.log('Created .env file template. Please update with your actual keys.');
}

// Optional Firebase Admin integration
let admin;
let firebaseInitialized = false;
try {
  admin = require('firebase-admin');
  const serviceAccountPath = './firebase-service-account.json';
  
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://kenya-on-a-budget-safaris.firebaseio.com" // Replace with your Firebase URL
    });
    
    firebaseInitialized = true;
    console.log('Firebase initialized successfully');
  } else {
    console.log('Firebase service account file not found. Running without Firebase integration.');
  }
} catch (error) {
  console.error('Firebase initialization error:', error);
  console.log('Running without Firebase integration.');
}

const app = express();
const PORT = process.env.PORT || 3000;

// Setup CORS - allow requests from anywhere during testing
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static('public')); // Serve static files if needed

// Simple home page
app.get('/', function(req, res) {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Activity Upgrades Payment Server</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { color: #333; }
        .card { background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 20px; margin-bottom: 20px; }
        .btn { background-color: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 4px; 
          cursor: pointer; font-size: 16px; text-decoration: none; display: inline-block; }
        .btn:hover { background-color: #0069d9; }
      </style>
    </head>
    <body>
      <h1>Activity Upgrades Payment Server</h1>
      <div class="card">
        <h2>Status: Running</h2>
        <p>Server is running on port ${PORT}</p>
        <p>Firebase integration: ${firebaseInitialized ? 'Enabled' : 'Disabled'}</p>
        <p>Stripe: Initialized</p>
        <p>Email: ${process.env.BREVO_API_KEY ? 'Configured' : 'Not Configured'}</p>
        <a href="/test-checkout" class="btn">Test Checkout</a>
      </div>
    </body>
    </html>
  `);
});

/**
 * Test checkout page
 */
app.get('/test-checkout', function(req, res) {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Activity Upgrades Test</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { color: #333; }
        .card { background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 20px; margin-bottom: 20px; }
        .btn { background-color: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 4px; 
          cursor: pointer; font-size: 16px; margin-top: 10px; }
        .btn:hover { background-color: #0069d9; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input, select { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 16px; }
        #status { padding: 15px; margin-top: 20px; border-radius: 4px; display: none; }
        .success { background-color: #d4edda; color: #155724; }
        .error { background-color: #f8d7da; color: #721c24; }
      </style>
    </head>
    <body>
      <h1>Activity Upgrades Test</h1>
      <div class="card">
        <h2>Test Checkout</h2>
        <form id="checkoutForm">
          <div class="form-group">
            <label for="userId">User ID:</label>
            <input type="text" id="userId" value="test-user-123" required>
          </div>
          
          <div class="form-group">
            <label for="itemName">Item Name:</label>
            <input type="text" id="itemName" value="Safari Adventure" required>
          </div>
          
          <div class="form-group">
            <label for="price">Price (£):</label>
            <input type="number" id="price" value="149.99" min="1" step="0.01" required>
          </div>
          
          <div class="form-group">
            <label for="quantity">Quantity:</label>
            <input type="number" id="quantity" value="1" min="1" max="10" required>
          </div>
          
          <button type="submit" class="btn" id="checkoutBtn">Proceed to Checkout</button>
        </form>
        <div id="status"></div>
      </div>

      <script>
        document.getElementById("checkoutForm").addEventListener("submit", function(e) {
          e.preventDefault();
          
          var statusEl = document.getElementById("status");
          statusEl.style.display = "none";
          
          var checkoutBtn = document.getElementById("checkoutBtn");
          checkoutBtn.disabled = true;
          checkoutBtn.textContent = "Processing...";
          
          try {
            var userId = document.getElementById("userId").value;
            var itemName = document.getElementById("itemName").value;
            var price = parseFloat(document.getElementById("price").value);
            var quantity = parseInt(document.getElementById("quantity").value);
            
            // Prepare data for the server
            var requestData = {
              userId: userId,
              items: [{
                title: itemName,
                price: price,
                quantity: quantity,
                activityId: "test-activity-" + Date.now()
              }],
              amount: price * quantity,
              originalAmount: price * quantity,
              type: "activity_upgrade"
            };
            
            // Use the server-side redirect approach
            window.location.href = "/create-and-redirect-checkout?data=" + encodeURIComponent(JSON.stringify(requestData));
            
          } catch (error) {
            statusEl.textContent = "Error: " + error.message;
            statusEl.className = "error";
            statusEl.style.display = "block";
            
            checkoutBtn.disabled = false;
            checkoutBtn.textContent = "Proceed to Checkout";
          }
        });
      </script>
    </body>
    </html>
  `);
});

/**
 * Create checkout session endpoint - This is the main endpoint that the upgrades.js frontend will call
 */
app.post('/create-checkout-session', async function(req, res) {
  try {
    console.log('Received checkout request:', req.body);
    
    // Extract data from request
    const { 
      userId, 
      items, 
      amount,
      originalAmount,
      discountAmount,
      couponCode,
      type,
      checkoutSessionId
    } = req.body;
    
    console.log('Processing checkout:', { 
      userId, 
      itemCount: items?.length || 0, 
      amount 
    });

    // Basic validation
    if (!userId) {
      console.error('Missing userId in request');
      return res.status(400).json({ error: 'Missing userId' });
    }

    // Calculate amount if not provided
    let calculatedAmount = amount;
    if (calculatedAmount === undefined || calculatedAmount === null) {
      if (items && Array.isArray(items) && items.length > 0) {
        calculatedAmount = 0;
        for (let i = 0; i < items.length; i++) {
          calculatedAmount += (items[i].price * items[i].quantity);
        }
        console.log('Calculated amount from items:', calculatedAmount);
      } else {
        console.error('Cannot determine amount');
        return res.status(400).json({ error: 'Missing amount' });
      }
    }
    
    // Format line items for Stripe
    if (!items || !Array.isArray(items) || items.length === 0) {
      console.error('Missing items array');
      return res.status(400).json({ error: 'Missing items' });
    }

    const timestamp = Date.now();
    
    // Generate a consistent booking ID as receipt number
    const randomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const bookingId = `KOB-${randomId}`;
    console.log('Generated booking ID / receipt number:', bookingId);
    
    // Format line items for Stripe
    const lineItems = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      lineItems.push({
        price_data: {
          currency: 'gbp',
          product_data: {
            name: item.title,
            description: `Quantity: ${item.quantity}`
          },
          unit_amount: Math.round(item.price * 100) // Convert to pence
        },
        quantity: item.quantity
      });
    }

    // Create success/cancel URLs
    const serverUrl = process.env.SERVER_URL || `http://localhost:${PORT}`;
    const successUrl = `${serverUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}&checkout_id=${checkoutSessionId || ''}&userId=${userId}`;
    const cancelUrl = `${serverUrl}/payment-cancelled?userId=${userId}`;

    console.log('Creating Stripe session with:', {
      lineItems: lineItems.length,
      successUrl,
      cancelUrl
    });

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId,
      metadata: {
        userId: userId,
        timestamp: timestamp.toString(),
        checkoutSessionId: checkoutSessionId || '',
        type: type || 'activity_upgrade',
        originalAmount: originalAmount ? originalAmount.toString() : calculatedAmount.toString(),
        discountAmount: discountAmount ? discountAmount.toString() : '0',
        couponCode: couponCode || 'none',
        bookingId: bookingId  // Store booking ID for receipt
      }
    });

    console.log('Checkout session created:', session.id);
    
    // Update Firebase if initialized and checkout session ID provided
    if (checkoutSessionId && firebaseInitialized) {
      try {
        await admin.firestore().collection('checkoutSessions').doc(checkoutSessionId).update({
          stripeSessionId: session.id,
          status: 'awaiting_payment',
          bookingId: bookingId,  // Store booking ID in Firestore
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`Updated checkout session ${checkoutSessionId} with Stripe session ID ${session.id}`);
      } catch (error) {
        console.error('Error updating Firestore:', error);
        // Continue even if Firestore update fails
      }
    }

    // Return session ID and URL - Both the classic response and the URL for fallback
    res.status(200).json({ 
      id: session.id,
      timestamp: timestamp,
      bookingId: bookingId,  // Return booking ID to client
      url: session.url // Including the URL allows fallback to direct redirect
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Server-side redirect checkout endpoint - alternative to client-side Stripe.js redirect
 */
app.get('/create-and-redirect-checkout', async function(req, res) {
  try {
    console.log('Received redirect checkout request');
    
    // Parse data from query parameter
    let data;
    try {
      data = JSON.parse(req.query.data || '{}');
    } catch (error) {
      console.error('Error parsing JSON data:', error);
      return res.status(400).send('Invalid request data');
    }
    
    console.log('Parsed data:', data);
    
    const { 
      userId, 
      items, 
      amount,
      originalAmount,
      discountAmount,
      couponCode,
      type,
      checkoutSessionId
    } = data;
    
    console.log('Processing redirect checkout:', { 
      userId: userId, 
      itemCount: items?.length || 0, 
      amount: amount 
    });

    // Basic validation
    if (!userId) {
      return res.status(400).send('Missing userId');
    }

    // Calculate amount if not provided
    let calculatedAmount = amount;
    if (calculatedAmount === undefined || calculatedAmount === null) {
      if (items && Array.isArray(items) && items.length > 0) {
        calculatedAmount = 0;
        for (let i = 0; i < items.length; i++) {
          calculatedAmount += (items[i].price * items[i].quantity);
        }
        console.log('Calculated amount from items:', calculatedAmount);
      } else {
        return res.status(400).send('Cannot determine amount');
      }
    }
    
    // Validate items
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).send('Missing items');
    }

    const timestamp = Date.now();
    
    // Generate a consistent booking ID as receipt number
    const randomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const bookingId = `KOB-${randomId}`;
    console.log('Generated booking ID / receipt number:', bookingId);
    
    // Format line items for Stripe
    const lineItems = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      lineItems.push({
        price_data: {
          currency: 'gbp',
          product_data: {
            name: item.title,
            description: `Quantity: ${item.quantity}`
          },
          unit_amount: Math.round(item.price * 100) // Convert to pence
        },
        quantity: item.quantity
      });
    }

    // Create success/cancel URLs
    const serverUrl = process.env.SERVER_URL || `http://localhost:${PORT}`;
    const successUrl = `${serverUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}&checkout_id=${checkoutSessionId || ''}&userId=${userId}`;
    const cancelUrl = `${serverUrl}/payment-cancelled?userId=${userId}`;

    console.log('Creating Stripe session with:', {
      lineItems: lineItems.length,
      successUrl,
      cancelUrl
    });

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId,
      metadata: {
        userId: userId,
        timestamp: timestamp.toString(),
        checkoutSessionId: checkoutSessionId || '',
        type: type || 'activity_upgrade',
        originalAmount: originalAmount ? originalAmount.toString() : calculatedAmount.toString(),
        discountAmount: discountAmount ? discountAmount.toString() : '0',
        couponCode: couponCode || 'none',
        bookingId: bookingId  // Store booking ID for receipt
      }
    });

    console.log('Checkout session created, redirecting to:', session.url);
    
    // Update Firebase if initialized and checkout session ID provided
    if (checkoutSessionId && firebaseInitialized) {
      try {
        await admin.firestore().collection('checkoutSessions').doc(checkoutSessionId).update({
          stripeSessionId: session.id,
          status: 'awaiting_payment',
          bookingId: bookingId,  // Store booking ID in Firestore
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`Updated checkout session ${checkoutSessionId} with Stripe session ID ${session.id}`);
      } catch (error) {
        console.error('Error updating Firestore:', error);
        // Continue even if Firestore update fails
      }
    }

    // Redirect to Stripe's checkout page
    if (session.url) {
      res.redirect(303, session.url);
    } else {
      res.status(500).send('Error creating checkout session URL');
    }
  } catch (error) {
    console.error('Error in create-and-redirect-checkout:', error);
    res.status(500).send(`Error: ${error.message}`);
  }
});

/**
 * Verify payment status endpoint
 */
// Updated verify-payment endpoint to automatically notify admins
// Add this to activity-upgrades-server.js (replacing the existing verify-payment endpoint)

/**
 * Verify payment status endpoint
 */
app.post('/verify-payment', async function(req, res) {
  try {
    const { sessionId, checkoutSessionId } = req.body;
    
    console.log('Verifying payment for session:', sessionId);
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items'] // Expand to get line items (purchased products)
    });
    console.log('Payment status:', session.payment_status);

    if (session.payment_status === 'paid') {
      // Extract information from metadata
      const metadata = session.metadata || {};
      const userId = metadata.userId;
      const savedCheckoutId = checkoutSessionId || metadata.checkoutSessionId;
      const originalAmount = parseFloat(metadata.originalAmount || (session.amount_total / 100));
      const discountAmount = parseFloat(metadata.discountAmount || 0);
      const finalAmount = session.amount_total / 100;
      const couponCode = metadata.couponCode !== 'none' ? metadata.couponCode : null;
      const bookingId = metadata.bookingId || `KOB-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      
      // Extract purchased items from line items
      let purchasedItems = [];
      if (session.line_items && session.line_items.data) {
        purchasedItems = session.line_items.data.map(item => ({
          title: item.description || 'Safari Package',
          price: item.amount_total / 100, // Convert from cents to pounds
          quantity: item.quantity || 1
        }));
      }
      
      // Process payment in Firebase if available
      if (savedCheckoutId && firebaseInitialized) {
        try {
          await processSuccessfulPayment(savedCheckoutId, session, bookingId);
          console.log(`Processed successful payment for checkout ${savedCheckoutId}`);
        } catch (error) {
          console.error('Error processing payment in Firebase:', error);
        }
      }
      
      // Get any additional items from Firebase if available
      let firebaseItems = [];
      if (firebaseInitialized && savedCheckoutId) {
        try {
          const checkoutDoc = await admin.firestore().collection('checkoutSessions').doc(savedCheckoutId).get();
          if (checkoutDoc.exists) {
            const checkoutData = checkoutDoc.data();
            if (checkoutData.items && Array.isArray(checkoutData.items)) {
              firebaseItems = checkoutData.items;
            }
          }
        } catch (error) {
          console.error('Error getting items from Firebase:', error);
        }
      }
      
      // Merge items from both sources (avoid duplicates)
      const allItems = [...purchasedItems];
      
      // Only add Firebase items that aren't already in purchasedItems
      if (firebaseItems.length > 0) {
        for (const fbItem of firebaseItems) {
          const exists = purchasedItems.some(item => 
            item.title === fbItem.title && 
            item.price === fbItem.price
          );
          
          if (!exists) {
            allItems.push({
              title: fbItem.title,
              price: fbItem.price,
              quantity: fbItem.quantity || 1
            });
          }
        }
      }

      // Prepare booking data for admin notification
      const bookingData = {
        packageId: metadata.packageId || 'unknown',
        packageName: metadata.packageName || 'Safari Package',
        originalAmount: originalAmount,
        amount: finalAmount,
        finalAmount: finalAmount,
        discountAmount: discountAmount,
        couponCode: couponCode,
        userId: userId,
        paymentDate: new Date().toISOString(),
        timestamp: Date.now(),
        bookingId: bookingId,
        receiptNumber: bookingId,
        paymentId: sessionId,
        // No customer info yet, this will be added when they enter their email
      };
      
      // Send admin notification immediately (without waiting for customer email)
      try {
        await sendAdminNotification(bookingData, allItems);
        console.log('Admin notification sent successfully');
      } catch (adminError) {
        console.error('Error sending admin notification:', adminError);
        // Continue even if admin notification fails
      }
      
      // Store the items for later use when sending customer receipt
      if (firebaseInitialized && savedCheckoutId) {
        try {
          await admin.firestore().collection('checkoutSessions').doc(savedCheckoutId).update({
            processedItems: allItems,
            adminNotified: true,
            adminNotifiedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } catch (error) {
          console.error('Error storing processed items:', error);
        }
      }
      
      res.json({
        paid: true,
        amount: finalAmount,
        originalAmount: originalAmount,
        discountAmount: discountAmount,
        finalAmount: finalAmount,
        couponCode: couponCode,
        customerId: session.customer,
        bookingId: bookingId,
        items: allItems, // Include items in response
        metadata: session.metadata,
        firebaseProcessed: savedCheckoutId && firebaseInitialized,
        adminNotified: true
      });
    } else {
      res.json({ 
        paid: false,
        status: session.payment_status,
        metadata: session.metadata
      });
    }
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Process successful payment in Firebase
 */
async function processSuccessfulPayment(checkoutSessionId, stripeSession, bookingId) {
  if (!firebaseInitialized) {
    throw new Error('Firebase not initialized');
  }
  
  // Check if this payment has already been processed
  const checkoutDoc = await admin.firestore().collection('checkoutSessions').doc(checkoutSessionId).get();
  
  if (!checkoutDoc.exists) {
    throw new Error(`Checkout session ${checkoutSessionId} not found`);
  }
  
  const checkoutData = checkoutDoc.data();
  
  // Skip if already processed
  if (checkoutData.status === 'completed' && checkoutData.paymentStatus === 'paid') {
    console.log(`Checkout session ${checkoutSessionId} already processed`);
    return;
  }
  
  // Update the checkout session status
  await admin.firestore().collection('checkoutSessions').doc(checkoutSessionId).update({
    status: 'completed',
    paymentStatus: 'paid',
    stripePaymentId: stripeSession.payment_intent,
    bookingId: bookingId,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  const userId = checkoutData.userId;
  
  // Move items from cart to purchased items
  if (checkoutData.items && checkoutData.items.length > 0) {
    // Create purchased activities
    const purchasedActivitiesBatch = admin.firestore().batch();
    
    for (let i = 0; i < checkoutData.items.length; i++) {
      const item = checkoutData.items[i];
      const purchaseRef = admin.firestore().collection('purchasedActivities').doc();
      
      purchasedActivitiesBatch.set(purchaseRef, {
        userId: userId,
        activityId: item.activityId,
        title: item.title,
        price: item.price,
        quantity: item.quantity,
        purchaseDate: admin.firestore.FieldValue.serverTimestamp(),
        checkoutSessionId: checkoutSessionId,
        stripeSessionId: stripeSession.id,
        bookingId: bookingId,
        status: 'active'
      });
    }
    
    await purchasedActivitiesBatch.commit();
    
    // Clear user's cart
    await admin.firestore().collection('carts').doc(userId).update({
      items: [],
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`Successfully processed checkout for user ${userId}`);
  }
}

/**
 * Endpoint to send receipt via email
 */
// Updated send-receipt-email endpoint
// Add this to activity-upgrades-server.js (replacing the existing route)

/**
 * Endpoint to send receipt via email
 */
app.post('/send-receipt-email', async function(req, res) {
  try {
    const { email, name, sessionId, checkoutId } = req.body;
    
    if (!email || !sessionId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email and session ID are required' 
      });
    }
    
    console.log(`Sending receipt to ${email} for session ${sessionId}`);
    
    // Verify payment status
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items'] // Expand to get line items (purchased products)
    });
    console.log('Payment status:', session.payment_status);

    if (session.payment_status !== 'paid') {
      return res.status(400).json({ 
        success: false, 
        error: 'Payment has not been completed' 
      });
    }
    
    // Extract information from session metadata
    const metadata = session.metadata || {};
    const userId = metadata.userId;
    const savedCheckoutId = checkoutId || metadata.checkoutSessionId;
    const originalAmount = parseFloat(metadata.originalAmount || (session.amount_total / 100));
    const discountAmount = parseFloat(metadata.discountAmount || 0);
    const finalAmount = session.amount_total / 100;
    const couponCode = metadata.couponCode !== 'none' ? metadata.couponCode : null;
    
    // Generate a receipt number/booking ID if not available
    const bookingId = metadata.bookingId || 
                     (savedCheckoutId ? savedCheckoutId.substring(0, 8) : null) || 
                     `KOB-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    
    // Extract purchased items from line items
    let purchasedItems = [];
    if (session.line_items && session.line_items.data) {
      purchasedItems = session.line_items.data.map(item => ({
        title: item.description || 'Safari Package',
        price: item.amount_total / 100, // Convert from cents to pounds
        quantity: item.quantity || 1
      }));
    }
    
    // Get any additional items from Firebase if available
    let firebaseItems = [];
    if (firebaseInitialized && savedCheckoutId) {
      try {
        const checkoutDoc = await admin.firestore().collection('checkoutSessions').doc(savedCheckoutId).get();
        if (checkoutDoc.exists) {
          const checkoutData = checkoutDoc.data();
          if (checkoutData.processedItems && Array.isArray(checkoutData.processedItems)) {
            // Use already processed items if available
            firebaseItems = checkoutData.processedItems;
          } else if (checkoutData.items && Array.isArray(checkoutData.items)) {
            firebaseItems = checkoutData.items;
          }
        }
      } catch (error) {
        console.error('Error getting items from Firebase:', error);
      }
    }
    
    // Use Firebase items if available and no Stripe items
    const allItems = purchasedItems.length > 0 ? purchasedItems : firebaseItems;
    
    // Prepare booking data for receipt generation
    const bookingData = {
      packageId: metadata.packageId || 'unknown',
      packageName: metadata.packageName || session.metadata?.description || 'Safari Package',
      originalAmount: originalAmount,
      amount: finalAmount,
      finalAmount: finalAmount,
      discountAmount: discountAmount,
      couponCode: couponCode,
      userId: userId,
      customerName: name || 'Valued Customer',
      customerEmail: email,
      paymentDate: new Date().toISOString(),
      timestamp: Date.now(),
      bookingId: bookingId,
      receiptNumber: bookingId,
      paymentId: sessionId
    };
    
    console.log('Generated booking data for receipt:', bookingData);
    
    // Generate receipt HTML
    const receiptHtml = await generateReceiptHtml(bookingData, allItems);
    
    // Send receipt email to customer
    await sendReceiptEmail(email, receiptHtml, bookingData);
    
    // Save email to Firebase if Firebase is available
    if (firebaseInitialized) {
      try {
        const db = admin.firestore();
        
        // Save to booking record if it exists
        if (savedCheckoutId) {
          await db.collection('checkoutSessions').doc(savedCheckoutId).update({
            customerEmail: email,
            customerName: name || null,
            receiptSent: true,
            receiptSentAt: admin.firestore.FieldValue.serverTimestamp()
          });
          console.log(`Updated checkout session ${savedCheckoutId} with receipt information`);
        }
        
        // Save receipt to dedicated collection
        await db.collection('sentReceipts').add({
          email: email,
          name: name || null,
          sessionId: sessionId,
          bookingId: bookingId,
          amount: finalAmount,
          originalAmount: originalAmount,
          discountAmount: discountAmount,
          couponCode: couponCode,
          userId: userId,
          sentAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log('Saved receipt information to Firebase');
      } catch (firebaseError) {
        console.error('Error saving to Firebase:', firebaseError);
        // Continue even if Firebase fails
      }
    }
    
    return res.json({ success: true });
    
  } catch (error) {
    console.error('Error sending receipt email:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to send receipt. Please try again later.' 
    });
  }
});

/**
 * Success page - displays after successful payment and verifies the payment
 */
app.get('/payment-success', function(req, res) {
  const sessionId = req.query.session_id;
  const checkoutId = req.query.checkout_id;
  const userId = req.query.userId;
  
  if (!sessionId) {
    return res.status(400).send('Missing session ID');
  }
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Successful</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          background-color: #f8f9fa;
          padding: 20px;
        }
        .container {
          background-color: white;
          padding: 30px;
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          text-align: center;
          max-width: 500px;
          width: 100%;
          margin: 0 auto;
        }
        h1 {
          color: #28a745;
          margin-bottom: 20px;
        }
        p {
          color: #555;
          line-height: 1.6;
          margin-bottom: 20px;
          font-size: 16px;
        }
        .status {
          font-weight: bold;
          margin-bottom: 30px;
        }
        .spinner {
          border: 4px solid rgba(0, 0, 0, 0.1);
          border-left-color: #28a745;
          border-radius: 50%;
          width: 30px;
          height: 30px;
          animation: spin 1s linear infinite;
          margin: 0 auto 20px;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .btn {
          background-color: #e67e22;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          text-decoration: none;
          transition: background-color 0.3s;
          display: inline-block;
          margin-top: 15px;
          font-weight: 500;
          font-size: 16px;
          cursor: pointer;
        }
        .btn:hover {
          background-color: #d35400;
        }
        .error {
          color: #dc3545;
          margin-top: 20px;
        }
        .success-icon {
          width: 80px;
          height: 80px;
          background-color: #28a745;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
          position: relative;
        }
        .checkmark {
          color: white;
          font-size: 40px;
          font-weight: bold;
        }
        .form-group {
          margin-bottom: 20px;
          text-align: left;
        }
        .form-label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
          color: #333;
        }
        .form-control {
          width: 100%;
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 16px;
          box-sizing: border-box;
        }
        .form-control:focus {
          border-color: #e67e22;
          outline: none;
          box-shadow: 0 0 0 3px rgba(230, 126, 34, 0.15);
        }
        .receipt-container {
          display: none;
          margin-top: 30px;
          padding: 20px;
          border: 1px solid #ddd;
          border-radius: 6px;
          background-color: #f9f9f9;
        }
        .receipt-frame {
          display: none;
          width: 100%;
          height: 500px;
          border: none;
          margin-top: 15px;
        }
        .hide {
          display: none !important;
        }
        .email-sent-success {
          display: none;
          background-color: #d4edda;
          color: #155724;
          padding: 15px;
          border-radius: 6px;
          margin-top: 15px;
        }
        .email-sent-error {
          display: none;
          background-color: #f8d7da;
          color: #721c24;
          padding: 15px;
          border-radius: 6px;
          margin-top: 15px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div id="loadingState">
          <div class="spinner"></div>
          <h1>Processing Your Payment</h1>
          <p>Please wait while we verify your payment...</p>
        </div>
        
        <div id="successState" style="display:none;">
          <div class="success-icon">
            <span class="checkmark">✓</span>
          </div>
          <h1>Payment Successful!</h1>
          <p>Thank you for your purchase. Your booking has been confirmed.</p>
          <p class="status">Status: <span id="paymentStatus">Paid</span></p>
          
          <!-- Email Form -->
          <div id="emailForm">
            <p>Enter your email address to receive your receipt:</p>
            <form id="receiptEmailForm">
              <div class="form-group">
                <label for="email" class="form-label">Email Address</label>
                <input type="email" id="email" name="email" class="form-control" placeholder="yourname@example.com" required>
              </div>
              <div class="form-group">
                <label for="name" class="form-label">Your Name (Optional)</label>
                <input type="text" id="name" name="name" class="form-control" placeholder="Your Name">
              </div>
              <button type="submit" class="btn" id="sendReceiptBtn">Send Receipt</button>
            </form>
            
            <div id="emailSentSuccess" class="email-sent-success">
              Receipt has been sent to your email! Please check your inbox.
            </div>
            
            <div id="emailSentError" class="email-sent-error">
              There was an error sending the receipt. Please try again.
            </div>
          </div>
          
          <div style="margin-top: 20px;">
            <a href="https://kenyaonabudgetsafaris.co.uk/login" class="btn" style="background-color: #6c757d;">Return to Homepage</a>
          </div>
        </div>
        
        <div id="errorState" style="display:none;">
          <h1 style="color: #dc3545;">Payment Verification Issue</h1>
          <p>We encountered a problem while verifying your payment.</p>
          <p class="error" id="errorMessage"></p>
          <a href="https://kenyaonabudgetsafaris.co.uk/login" class="btn" style="background-color: #6c757d;">Return to Homepage</a>
        </div>
      </div>

      <script>
        // On page load, verify the payment
        document.addEventListener('DOMContentLoaded', function() {
          verifyPayment();

          // Set up the email form submission
          const emailForm = document.getElementById('receiptEmailForm');
          emailForm.addEventListener('submit', function(event) {
            event.preventDefault();
            
            const email = document.getElementById('email').value;
            const name = document.getElementById('name').value;
            
            // Disable the button during submission
            const sendButton = document.getElementById('sendReceiptBtn');
            sendButton.disabled = true;
            sendButton.textContent = 'Sending...';
            
            // Hide previous messages
            document.getElementById('emailSentSuccess').style.display = 'none';
            document.getElementById('emailSentError').style.display = 'none';
            
            // Send the email request
            fetch('/send-receipt-email', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                email: email,
                name: name,
                sessionId: "${sessionId}",
                checkoutId: "${checkoutId || ''}"
              })
            })
            .then(response => response.json())
            .then(data => {
              sendButton.disabled = false;
              sendButton.textContent = 'Send Receipt';
              
              if (data.success) {
                document.getElementById('emailSentSuccess').style.display = 'block';
                // Hide the form after successful submission
                emailForm.style.display = 'none';
              } else {
                document.getElementById('emailSentError').textContent = data.error || 'Error sending receipt';
                document.getElementById('emailSentError').style.display = 'block';
              }
            })
            .catch(error => {
              console.error('Error sending email:', error);
              sendButton.disabled = false;
              sendButton.textContent = 'Send Receipt';
              document.getElementById('emailSentError').textContent = 'Network error. Please try again.';
              document.getElementById('emailSentError').style.display = 'block';
            });
          });
        });

        // Verify the payment status using XMLHttpRequest
        function verifyPayment() {
          var xhr = new XMLHttpRequest();
          xhr.open("POST", "/verify-payment", true);
          xhr.setRequestHeader("Content-Type", "application/json");
          xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
              document.getElementById("loadingState").style.display = "none";
              if (xhr.status === 200) {
                var result = JSON.parse(xhr.responseText);
                if (result.paid) {
                  document.getElementById("successState").style.display = "block";
                  document.getElementById("paymentStatus").textContent = "Paid";
                  
                  // Store payment data for receipt generation
                  if (window.localStorage) {
                    localStorage.setItem('paymentData', JSON.stringify(result));
                  }
                } else {
                  document.getElementById("errorState").style.display = "block";
                  document.getElementById("errorMessage").textContent = "Payment not completed. Status: " + (result.status || "unknown");
                }
              } else {
                document.getElementById("errorState").style.display = "block";
                document.getElementById("errorMessage").textContent = "Error: " + xhr.statusText;
              }
            }
          };
          xhr.send(JSON.stringify({ 
            sessionId: "${sessionId}",
            checkoutId: "${checkoutId || ''}" 
          }));
        }
      </script>
    </body>
    </html>
  `);
});

/**
 * Cancelled payment page
 */
app.get('/payment-cancelled', function(req, res) {
  const userId = req.query.userId;
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Cancelled</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
          background-color: #f8f9fa;
        }
        .container {
          background-color: white;
          padding: 30px;
          border-radius: 8px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          text-align: center;
          max-width: 500px;
          width: 90%;
        }
        h1 {
          color: #6c757d;
          margin-bottom: 20px;
        }
        p {
          color: #555;
          line-height: 1.6;
          margin-bottom: 20px;
        }
        .btn {
          background-color: #007bff;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 4px;
          text-decoration: none;
          transition: background-color 0.3s;
          display: inline-block;
          margin-top: 10px;
          margin-right: 10px;
        }
        .btn:hover {
          background-color: #0069d9;
        }
        .btn-outline {
          background-color: transparent;
          color: #007bff;
          border: 1px solid #007bff;
        }
        .btn-outline:hover {
          background-color: #f1f8ff;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Payment Cancelled</h1>
        <p>Your payment process was cancelled. No charges have been made.</p>
        <p>Your items are still in your cart if you wish to complete the purchase later.</p>
        <div>
          <a href="https://kenyaonabudgetsafaris.co.uk/login" class="btn">Return to Homepage</a>
          <a href="https://kenyaonabudgetsafaris.co.uk/login" class="btn btn-outline">Back to Cart</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Health check endpoint
app.get('/health', function(req, res) {
  res.json({ 
    status: 'healthy', 
    message: 'Activity upgrades payment server is running',
    firebase: firebaseInitialized ? 'connected' : 'disabled',
    email: process.env.BREVO_API_KEY ? 'configured' : 'not configured'
  });
});

// Start the server
app.listen(PORT, function() {
  console.log(`
===========================================
🔥 Activity Upgrades Payment Server running on port ${PORT} 🔥
===========================================

Available endpoints:
- GET  /                          - Home page
- GET  /test-checkout             - Test checkout page
- POST /create-checkout-session   - Create Stripe checkout session (for frontend)
- GET  /create-and-redirect-checkout - Server-side redirect to Stripe (alternative)
- POST /verify-payment            - Verify payment status
- GET  /payment-success           - Success page with verification
- GET  /payment-cancelled         - Payment cancelled page
- POST /send-receipt-email        - Send receipt via email
- GET  /health                    - Health check endpoint

Firebase integration: ${firebaseInitialized ? 'ENABLED' : 'DISABLED'}
Email integration: ${process.env.BREVO_API_KEY ? 'ENABLED' : 'DISABLED'}

Server is ready for activity upgrades payments!
  `);
});