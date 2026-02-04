// Quick script to clear test Stripe data via the Cloud Function
const https = require('https');

const projectId = 'g3-church-network';
const functionUrl = `https://us-central1-${projectId}.cloudfunctions.net/clearTestStripeData`;

console.log('Calling clearTestStripeData Cloud Function...');
console.log('URL:', functionUrl);

const postData = JSON.stringify({ data: {} });

const options = {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = https.request(functionUrl, options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('\nResponse Status:', res.statusCode);
    console.log('\nResponse Body:', data);
    
    try {
      const result = JSON.parse(data);
      console.log('\nParsed Result:', JSON.stringify(result, null, 2));
    } catch (e) {
      console.log('Could not parse JSON response');
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error);
});

req.write(postData);
req.end();
