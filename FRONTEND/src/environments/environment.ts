// Detección automática: Si estás en tu computadora (localhost) usa el servidor local.
// Cuando la abras desde internet o tu celular, apuntará a la URL de tu Backend en Render.
const isLocal = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const environment = {
  production: !isLocal,
  apiUrl: isLocal 
    ? 'http://127.0.0.1:8000/api'
    : 'https://anotao-api.onrender.com/api' // <- Aquí colocaremos la URL que nos dé Render al desplegar el backend
};
