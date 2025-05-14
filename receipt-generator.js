// Updated receipt-generator.js with purchased items display
const QRCode = require('qrcode');

// Generate a receipt HTML for a booking
const generateReceiptHtml = async (bookingData, items = []) => {
  try {
    console.log('Generating receipt with booking data:', bookingData);
    
    // Use booking ID as receipt number
    const receiptNumber = bookingData.bookingId || 
                         bookingData.receiptNumber || 
                         `KOB-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    
    console.log('Using receipt number:', receiptNumber);
    
    // Process discount and payment information
    const hasDiscount = bookingData.discountAmount > 0 && bookingData.couponCode;
    const originalAmount = bookingData.originalAmount || bookingData.amount || 0;
    const discountAmount = bookingData.discountAmount || 0;
    const finalAmount = bookingData.finalAmount || bookingData.amount || 0;
    const couponCode = bookingData.couponCode || 'None';
    
    // Calculate discount percentage if applicable
    let discountPercentage = 0;
    if (discountAmount > 0 && originalAmount > 0) {
      discountPercentage = (discountAmount / originalAmount) * 100;
    }
    
    // Format coupon information
    let couponInfo = {
      code: couponCode !== 'None' ? couponCode : 'None',
      applied: hasDiscount,
      discountAmount: discountAmount,
      discountPercentage: discountPercentage.toFixed(1),
      description: hasDiscount ? 
        `${couponCode} (£${discountAmount.toFixed(2)} discount - ${discountPercentage.toFixed(1)}%)` : 
        'No coupon applied',
      isFreeBooking: finalAmount === 0 && hasDiscount
    };
    
    // Format date for receipt
    const paymentDate = new Date(bookingData.paymentDate || Date.now()).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    // Generate QR code data
    const qrCodeData = JSON.stringify({
      receiptNumber: receiptNumber,
      bookingId: bookingData.bookingId || receiptNumber,
      packageName: bookingData.packageName,
      amount: originalAmount,
      finalAmount: finalAmount,
      discount: discountAmount,
      couponCode: couponCode,
      date: paymentDate,
      userId: bookingData.userId
    });
    
    // Generate QR code image
    let qrCodeUrl;
    try {
      qrCodeUrl = await QRCode.toDataURL(qrCodeData);
    } catch (error) {
      console.error('Error generating QR code:', error);
      qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrCodeData)}`;
    }
    
    // Generate items HTML if items are provided
    let itemsHtml = '';
    if (items && items.length > 0) {
      itemsHtml = `
        <!-- Purchased Items -->
        <h3 style="margin: 30px 0 20px; font-size: 18px; color: #e67e22; border-bottom: 2px solid #e67e22; padding-bottom: 10px;">Purchased Upgrades</h3>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px; border-collapse: collapse;">
          <tr style="background-color: #f5f5f5;">
            <th style="text-align: left; padding: 10px; border: 1px solid #ddd; font-size: 14px;">Item</th>
            <th style="text-align: center; padding: 10px; border: 1px solid #ddd; font-size: 14px;">Quantity</th>
            <th style="text-align: right; padding: 10px; border: 1px solid #ddd; font-size: 14px;">Price</th>
          </tr>
      `;
      
      items.forEach(item => {
        itemsHtml += `
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd;">${item.title || 'Unknown Item'}</td>
            <td style="text-align: center; padding: 10px; border: 1px solid #ddd;">${item.quantity || 1}</td>
            <td style="text-align: right; padding: 10px; border: 1px solid #ddd;">£${typeof item.price === 'number' ? item.price.toFixed(2) : '0.00'}</td>
          </tr>
        `;
      });
      
      itemsHtml += `</table>`;
    }
    
    // Create email-friendly receipt with inline styles AND COUPON INFORMATION
    const emailReceiptHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Receipt - KenyaOnABudget Safaris</title>
</head>
<body style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f7f7f7;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 650px; margin: 0 auto; background-color: #ffffff;">
    <!-- Header -->
    <tr>
      <td style="padding: 20px; text-align: center; background-color: #ffffff; border-bottom: 1px solid #e0e0e0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td>
              <div style="display: inline-block; width: 50px; height: 50px; background-color: #f5f5f5; border-radius: 8px; text-align: center; line-height: 50px; font-weight: bold; font-size: 24px; color: #e67e22;">K</div>
            </td>
            <td style="padding-left: 15px; text-align: left;">
              <h1 style="margin: 0; font-size: 24px; color: #e67e22;">KenyaOnABudget Safaris</h1>
              <p style="margin: 5px 0 0; font-size: 14px; color: #666;">Kenya On Your Terms: Smart Or Grand We Make it Happen!</p>
            </td>
          </tr>
        </table>
        <p style="margin-top: 15px; font-size: 14px; color: #666; text-align: right;">
          Paid Receipt #${receiptNumber}<br>
          ${paymentDate}
        </p>
      </td>
    </tr>
    
    <!-- Banner -->
    <tr>
      <td style="padding: 30px 20px; background-color: #e67e22; color: #ffffff;">
        <h2 style="margin: 0 0 10px; font-size: 24px;">Booking Confirmation</h2>
        <p style="margin: 0 0 15px; font-size: 18px;">${bookingData.packageName || 'Safari Package'}</p>
        <p style="margin: 0; font-size: 16px; background-color: rgba(255,255,255,0.2); display: inline-block; padding: 5px 10px; border-radius: 4px;">ID: ${bookingData.packageId || 'N/A'}</p>
      </td>
    </tr>
    
    <!-- Customer Information -->
    <tr>
      <td style="padding: 30px 20px;">
        <h3 style="margin: 0 0 20px; font-size: 18px; color: #e67e22; border-bottom: 2px solid #e67e22; padding-bottom: 10px;">Customer Information</h3>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;">
          <tr>
            <td width="50%" valign="top" style="padding-bottom: 15px;">
              <p style="margin: 0 0 5px; font-size: 12px; color: #666; text-transform: uppercase; font-weight: bold;">Name</p>
              <p style="margin: 0; font-size: 16px; font-weight: 600;">${bookingData.customerName || 'Not specified'}</p>
            </td>
            <td width="50%" valign="top" style="padding-bottom: 15px;">
              <p style="margin: 0 0 5px; font-size: 12px; color: #666; text-transform: uppercase; font-weight: bold;">Email</p>
              <p style="margin: 0; font-size: 16px; font-weight: 600;">${bookingData.customerEmail || 'Not specified'}</p>
            </td>
          </tr>
          <tr>
            <td width="50%" valign="top" style="padding-bottom: 15px;">
              <p style="margin: 0 0 5px; font-size: 12px; color: #666; text-transform: uppercase; font-weight: bold;">Customer ID</p>
              <p style="margin: 0; font-size: 16px; font-weight: 600;">${bookingData.userId ? bookingData.userId.substring(0, 10) + '...' : 'Not available'}</p>
            </td>
            <td width="50%" valign="top" style="padding-bottom: 15px;">
              <p style="margin: 0 0 5px; font-size: 12px; color: #666; text-transform: uppercase; font-weight: bold;">Payment Date</p>
              <p style="margin: 0; font-size: 16px; font-weight: 600;">${paymentDate}</p>
            </td>
          </tr>
          <tr>
            <td width="50%" valign="top">
              <p style="margin: 0 0 5px; font-size: 12px; color: #666; text-transform: uppercase; font-weight: bold;">Booking ID</p>
              <p style="margin: 0; font-size: 16px; font-weight: 600;">${receiptNumber}</p>
            </td>
          </tr>
        </table>
        
        ${itemsHtml}
        
        <!-- Coupon Information -->
        <h3 style="margin: 30px 0 20px; font-size: 18px; color: #e67e22; border-bottom: 2px solid #e67e22; padding-bottom: 10px;">Coupon Information</h3>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px; background-color: #FEF9E7; border-radius: 8px; border: 1px dashed #e67e22;">
          <tr>
            <td style="padding: 20px;">
              ${hasDiscount ? `
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="50%" valign="top" style="padding-bottom: 15px;">
                    <p style="margin: 0 0 5px; font-size: 12px; color: #666; text-transform: uppercase; font-weight: bold;">Coupon Code</p>
                    <p style="margin: 0; font-size: 16px; font-weight: 600;">${couponCode}</p>
                    ${couponInfo.isFreeBooking ? '<p style="margin-top: 5px; display: inline-block; padding: 3px 10px; background-color: #27ae60; color: white; border-radius: 12px; font-size: 12px; font-weight: 600;">Free Booking</p>' : ''}
                  </td>
                  <td width="50%" valign="top" style="padding-bottom: 15px;">
                    <p style="margin: 0 0 5px; font-size: 12px; color: #666; text-transform: uppercase; font-weight: bold;">Discount</p>
                    <p style="margin: 0; font-size: 16px; font-weight: 600;">£${discountAmount.toFixed(2)} (${discountPercentage.toFixed(1)}%)</p>
                  </td>
                </tr>
                <tr>
                  <td width="50%" valign="top">
                    <p style="margin: 0 0 5px; font-size: 12px; color: #666; text-transform: uppercase; font-weight: bold;">Original Price</p>
                    <p style="margin: 0; font-size: 16px; font-weight: 600;">£${originalAmount.toFixed(2)}</p>
                  </td>
                  <td width="50%" valign="top">
                    <p style="margin: 0 0 5px; font-size: 12px; color: #666; text-transform: uppercase; font-weight: bold;">Final Price</p>
                    <p style="margin: 0; font-size: 16px; font-weight: 600;">£${finalAmount.toFixed(2)}</p>
                  </td>
                </tr>
              </table>
              ` : `
              <p style="margin: 0; font-size: 16px; color: #666; font-style: italic;">No coupon was applied to this booking.</p>
              `}
            </td>
          </tr>
        </table>
        
        <!-- Booking Details -->
        <h3 style="margin: 30px 0 20px; font-size: 18px; color: #e67e22; border-bottom: 2px solid #e67e22; padding-bottom: 10px;">Booking Details</h3>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;">
          <tr>
            <td width="50%" valign="top" style="padding-bottom: 15px;">
              <p style="margin: 0 0 5px; font-size: 12px; color: #666; text-transform: uppercase; font-weight: bold;">Package</p>
              <p style="margin: 0; font-size: 16px; font-weight: 600;">${bookingData.packageName || 'Safari Package'}</p>
            </td>
            <td width="50%" valign="top" style="padding-bottom: 15px;">
              <p style="margin: 0 0 5px; font-size: 12px; color: #666; text-transform: uppercase; font-weight: bold;">Package ID</p>
              <p style="margin: 0; font-size: 16px; font-weight: 600;">${bookingData.packageId || 'N/A'}</p>
            </td>
          </tr>
          <tr>
            <td width="50%" valign="top">
              <p style="margin: 0 0 5px; font-size: 12px; color: #666; text-transform: uppercase; font-weight: bold;">Booking Date</p>
              <p style="margin: 0; font-size: 16px; font-weight: 600;">${new Date(bookingData.timestamp || Date.now()).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'long',
                year: 'numeric'
              })}</p>
            </td>
            <td width="50%" valign="top">
              <p style="margin: 0 0 5px; font-size: 12px; color: #666; text-transform: uppercase; font-weight: bold;">Payment Method</p>
              <p style="margin: 0; font-size: 16px; font-weight: 600;">${couponInfo.isFreeBooking ? 'Coupon (100% discount)' : 'Credit Card (Stripe)'}</p>
            </td>
          </tr>
        </table>
        
        <!-- Payment Summary -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0; background-color: #f5f5f5; border-radius: 8px;">
          <tr>
            <td style="padding: 20px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-bottom: 10px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-size: 16px; color: #444;">${bookingData.packageName || 'Safari Package'}</td>
                        <td style="font-size: 16px; color: #444; text-align: right; font-weight: 600;">£${typeof originalAmount === 'number' ? originalAmount.toFixed(2) : '0.00'}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ${hasDiscount ? `
                <tr>
                  <td style="padding-bottom: 10px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-size: 16px; color: #444;">Discount (${couponCode})</td>
                        <td style="font-size: 16px; color: #27ae60; text-align: right; font-weight: 600;">-£${typeof discountAmount === 'number' ? discountAmount.toFixed(2) : '0.00'}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding-bottom: 10px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-size: 16px; color: #444;">Processing Fee</td>
                        <td style="font-size: 16px; color: #444; text-align: right; font-weight: 600;">£0.00</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top: 15px; border-top: 2px dashed #e0e0e0;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-size: 18px; color: #e67e22; font-weight: 700;">Total Paid</td>
                        <td style="font-size: 18px; color: #e67e22; text-align: right; font-weight: 700;">£${typeof finalAmount === 'number' ? finalAmount.toFixed(2) : '0.00'}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        
        <!-- QR Code -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 30px 0; background-color: #f9f9f9; border-radius: 8px; border: 1px solid #e0e0e0;">
          <tr>
            <td style="padding: 20px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="120" valign="top">
                    <img src="${qrCodeUrl}" alt="Booking QR Code" style="border: 1px solid #e0e0e0; padding: 5px; background-color: #ffffff; border-radius: 8px; width: 120px; height: 120px;">
                  </td>
                  <td valign="top" style="padding-left: 20px;">
                    <h4 style="margin: 0 0 10px; color: #e67e22; font-size: 16px;">Booking Verification</h4>
                    <p style="margin: 0; font-size: 14px; color: #444; line-height: 1.5;">
                      Scan this QR code to verify your booking or to check in at our office. This code contains your unique booking details and will be required during your safari adventure. Please ensure you have it available on your phone or as a printed copy.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        
        <!-- Thank You Message -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 30px 0 10px; text-align: center; border-top: 1px dashed #e0e0e0; border-bottom: 1px dashed #e0e0e0;">
          <tr>
            <td style="padding: 30px 0;">
              <h3 style="margin: 0 0 15px; color: #e67e22; font-size: 22px;">Thank You For Your Booking!</h3>
              <p style="margin: 0; font-size: 16px; color: #444; font-style: italic;">"We're excited to welcome you on your upcoming safari adventure where memories and wildlife encounters await."</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    
    <!-- Footer -->
    <tr>
      <td style="padding: 20px; background-color: #f5f5f5; text-align: center; font-size: 14px; color: #666;">
        <p style="margin: 0 0 10px; font-weight: 700; color: #555; font-size: 16px;">KenyaOnABudget Safaris</p>
        <p style="margin: 0 0 10px;">FARINGDON (SN7), SHELLINGFORD, FERNHAM ROAD<br>UNITED KINGDOM</p>
        <p style="margin: 10px 0;">
          Email: <a href="mailto:info@kenyaonabudgetsafaris.co.uk" style="color: #e67e22; text-decoration: none;">info@kenyaonabudgetsafaris.co.uk</a> | 
          Phone: +44 7376 642 148
        </p>
        <p style="margin: 20px 0 0; font-size: 12px; color: #777;">
          This receipt was automatically generated and is valid without signature.<br>
          &copy; ${new Date().getFullYear()} KenyaOnABudget Safaris. All rights reserved.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
    
    return emailReceiptHtml;
  } catch (error) {
    console.error('Error generating receipt HTML:', error);
    throw error;
  }
};

module.exports = {
  generateReceiptHtml
};