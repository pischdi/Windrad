// Test script to simulate worker request
const testData = {
  image: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
  metadata: {
    turbine: {
      name: "Test",
      lat: 51.5,
      lon: 14.0,
      hubHeight: 150,
      rotorDiameter: 100,
      totalHeight: 200
    },
    camera: {
      lat: 51.48,
      lng: 13.98,
      altitude: 100,
      distance: 2300
    }
  }
};

console.log('Test payload:', JSON.stringify(testData, null, 2));
