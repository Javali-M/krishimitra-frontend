# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Backend API integration

The dashboard now reads chat replies and weather alerts from your backend.

Set these environment variables in a `.env` file (project root):

```bash
VITE_API_BASE_URL=http://localhost:8080
VITE_AUTH_SIGNUP_ENDPOINT=/api/auth/signup
VITE_AUTH_LOGIN_ENDPOINT=/api/auth/login
VITE_AUTH_LOGOUT_ENDPOINT=/api/auth/logout
VITE_FARMER_ASK_ENDPOINT=/api/farmer/ask
VITE_CHAT_IMAGE_ENDPOINT=/api/chat/images
VITE_WEATHER_ENDPOINT=/api/weather/alerts
```

Authentication is token-based. The frontend stores the token returned by signup/login and sends it as `Authorization: Bearer <token>` for protected requests.

### Expected API calls

- `POST {VITE_AUTH_SIGNUP_ENDPOINT}`
  - Body: `{ "fullName": "...", "email": "...", "password": "..." }`
  - Response: includes `token`

- `POST {VITE_AUTH_LOGIN_ENDPOINT}`
  - Body: `{ "email": "...", "password": "..." }`
  - Response: includes `token`

- `POST {VITE_AUTH_LOGOUT_ENDPOINT}`
  - Header: `Authorization: Bearer <token>`

- `POST {VITE_FARMER_ASK_ENDPOINT}`
  - Header: `Authorization: Bearer <token>`
  - Body: `{ "question": "..." }`
  - Response: one of `{ answer }`, `{ reply }`, `{ response }`, `{ message }`, or plain text

- `POST {VITE_CHAT_IMAGE_ENDPOINT}`
  - Body: `multipart/form-data` with fields:
    - `image` (file)
  - Response: one of `{ reply }`, `{ response }`, `{ message }`, or plain text

- `GET {VITE_WEATHER_ENDPOINT}?email=user@example.com`
  - Response can be one of:
    - `{ temperature, alert }`
    - `{ tempC, alerts }`
    - `{ data: { temperature, alert } }`
