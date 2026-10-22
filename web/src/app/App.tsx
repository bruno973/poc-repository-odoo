import { RouterProvider } from "./router.js";
import { Routes } from "./routes.js";
import { SessionProvider } from "./session.js";

export function App() {
  return (
    <RouterProvider>
      <SessionProvider>
        <Routes />
      </SessionProvider>
    </RouterProvider>
  );
}
