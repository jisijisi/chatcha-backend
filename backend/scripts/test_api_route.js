
async function testRoute() {
  try {
    const response = await fetch('http://localhost:3000/api/notifications?userId=1');
    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Data:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

testRoute();
