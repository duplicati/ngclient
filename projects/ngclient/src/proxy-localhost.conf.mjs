export default {
  '/api': {
    target: 'http://localhost:8200',
    secure: false,
  },
  '/notifications': {
    target: 'http://localhost:8200',
    secure: false,
    ws: true,
  },
};
