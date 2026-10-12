import { createServer } from 'node:http';
import { addItem, emptyCart, subtotalCents } from './cart.js';
import { renderPage } from './render.js';

const DEFAULT_PORT = 8080;
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;

let cart = addItem(addItem(emptyCart(), 'MUG-01', 1), 'TEE-02', 2);

const server = createServer((request, response) => {
  if (request.url === '/') {
    response.writeHead(HTTP_OK, { 'content-type': 'text/html; charset=utf-8' });
    response.end(renderPage(cart));
    return;
  }
  if (request.url === '/api/cart') {
    response.writeHead(HTTP_OK, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ...cart, subtotalCents: subtotalCents(cart) }));
    return;
  }
  response.writeHead(HTTP_NOT_FOUND).end();
});

server.listen(Number(process.env.PORT ?? DEFAULT_PORT));
