export default {
  '/api': {
    target: 'http://10.211.55.3:8200',
    secure: false,
  },
  '/notifications': {
    target: 'ws://10.211.55.3:8200',
    secure: false,
    ws: true,
  },
};
