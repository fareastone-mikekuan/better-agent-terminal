const https = require('https');

const CLIENT_ID = 'Ov23li7ONNXhQEmmImcW';
const DEVICE_CODE = '373960968bce36468bbc58806a4b58294c060c00'; // 最近的 device code

console.log('嘗試獲取 OAuth token...');
console.log('Device Code:', DEVICE_CODE);

function completeDeviceFlow() {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({
      client_id: CLIENT_ID,
      device_code: DEVICE_CODE,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    });

    const options = {
      hostname: 'github.com',
      path: '/login/oauth/access_token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk });
      res.on('end', () => {
        console.log('\n回應:', data);
        const response = JSON.parse(data);
        
        if (response.access_token) {
          console.log('\n✅ 成功獲取 token!');
          console.log('\n請將以下 token 貼到應用程式的 Settings > API Key / Token:');
          console.log('\n' + response.access_token + '\n');
          resolve(response.access_token);
        } else if (response.error === 'authorization_pending') {
          console.log('\n⏳ 授權仍在等待中...');
          reject(new Error('PENDING'));
        } else {
          console.log('\n❌ 錯誤:', response.error);
          reject(new Error(response.error));
        }
      });
    });

    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

completeDeviceFlow().catch(err => {
  if (err.message !== 'PENDING') {
    console.error('錯誤:', err);
    process.exit(1);
  }
});
