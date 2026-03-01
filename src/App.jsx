import { useEffect, useState } from "react";
import "./App.css";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
const FARMER_ASK_ENDPOINT = import.meta.env.VITE_FARMER_ASK_ENDPOINT || "/api/farmer/ask";
const CHAT_IMAGE_ENDPOINT = import.meta.env.VITE_CHAT_IMAGE_ENDPOINT || "/api/chat/images";
const WEATHER_ENDPOINT = import.meta.env.VITE_WEATHER_ENDPOINT || "/api/weather/alerts";
const AUTH_SIGNUP_ENDPOINT = import.meta.env.VITE_AUTH_SIGNUP_ENDPOINT || "/api/auth/signup";
const AUTH_LOGIN_ENDPOINT = import.meta.env.VITE_AUTH_LOGIN_ENDPOINT || "/api/auth/login";
const AUTH_LOGOUT_ENDPOINT = import.meta.env.VITE_AUTH_LOGOUT_ENDPOINT || "/api/auth/logout";
const TOKEN_STORAGE_KEY = "farmai_auth_token";
const USER_STORAGE_KEY = "farmai_auth_user";

const createMessageId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const buildApiUrl = (path) => {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  return `${API_BASE_URL}${path}`;
};

const apiRequest = async (path, options = {}) => {
  const response = await fetch(buildApiUrl(path), {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {})
    }
  });

  const contentType = response.headers.get("content-type") || "";
  const responseBody = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof responseBody === "string"
      ? responseBody
      : responseBody?.message || "Request failed";
    throw new Error(message);
  }

  return responseBody;
};

const extractToken = (responseData) => responseData?.token || responseData?.data?.token || null;

const extractUser = (responseData) => {
  const payload = responseData?.user || responseData?.data?.user || responseData?.data || responseData;

  if (!payload?.email && !payload?.fullName && !payload?.name) {
    return null;
  }

  return {
    name: payload.fullName || payload.name || "Farmer",
    email: payload.email || ""
  };
};

const extractBotText = (responseData) => {
  if (typeof responseData === "string") {
    return responseData;
  }

  return (
    responseData?.answer ||
    responseData?.reply ||
    responseData?.response ||
    responseData?.message ||
    responseData?.text ||
    "I received your request successfully."
  );
};

const extractWeatherCardData = (responseData) => {
  const payload = responseData?.data || responseData;
  const temperature = payload?.temperature ?? payload?.tempC ?? payload?.temp ?? "--";
  const alert = payload?.alert || payload?.alerts || payload?.description || "No weather alerts";

  return {
    temperature,
    alert: Array.isArray(alert) ? alert[0] || "No weather alerts" : alert
  };
};

const toDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read image."));
    reader.readAsDataURL(file);
  });

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem(USER_STORAGE_KEY);
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY) || "");
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: ""
  });
  const [authError, setAuthError] = useState("");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [weatherInfo, setWeatherInfo] = useState({ temperature: "--", alert: "Loading weather..." });

  useEffect(() => {
    if (!token) {
      setCurrentUser(null);
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(USER_STORAGE_KEY);
      return;
    }

    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    if (currentUser) {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(currentUser));
    }
  }, [token, currentUser]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const fetchWeatherAlerts = async () => {
      try {
        const responseData = await apiRequest(WEATHER_ENDPOINT, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        setWeatherInfo(extractWeatherCardData(responseData));
      } catch {
        setWeatherInfo({ temperature: "--", alert: "Weather service unavailable" });
      }
    };

    fetchWeatherAlerts();
  }, [token]);

  const handleAuthInput = (event) => {
    const { name, value } = event.target;
    setAuthForm((prevForm) => ({ ...prevForm, [name]: value }));
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();

    const email = authForm.email.trim().toLowerCase();
    const password = authForm.password.trim();
    const fullName = authForm.name.trim();

    if (!email || !password || (authMode === "signup" && !fullName)) {
      setAuthError("Please fill all required fields.");
      return;
    }

    setIsAuthSubmitting(true);

    try {
      const endpoint = authMode === "signup" ? AUTH_SIGNUP_ENDPOINT : AUTH_LOGIN_ENDPOINT;
      const payload = authMode === "signup"
        ? { fullName, email, password }
        : { email, password };

      const responseData = await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      const authToken = extractToken(responseData);

      if (!authToken) {
        throw new Error("Authentication succeeded but token was missing.");
      }

      const user = extractUser(responseData) || {
        name: fullName || "Farmer",
        email
      };

      setToken(authToken);
      setCurrentUser(user);
      setMessages([]);
      setAuthForm({ name: "", email: "", password: "" });
      setAuthError("");
    } catch (error) {
      setAuthError(error.message || "Authentication failed.");
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const logout = async () => {
    if (!token) {
      setCurrentUser(null);
      return;
    }

    try {
      await apiRequest(AUTH_LOGOUT_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
    } catch {
      // Keep UI logout behavior even if backend logout call fails.
    }

    setToken("");
    setCurrentUser(null);
    setMessages([]);
    setWeatherInfo({ temperature: "--", alert: "Loading weather..." });
    setQuestion("");
    setAuthError("");
  };

  const sendMessage = async () => {
    const userText = question.trim();

    if (!userText || isSending || !token) return;

    setQuestion("");
    setIsSending(true);

    setMessages((prevMessages) => [
      ...prevMessages,
      { id: createMessageId(), role: "user", type: "text", text: userText }
    ]);

    try {
      const responseData = await apiRequest(FARMER_ASK_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          question: userText
        })
      });

      setMessages((prevMessages) => [
        ...prevMessages,
        {
          id: createMessageId(),
          role: "bot",
          type: "text",
          text: extractBotText(responseData)
        }
      ]);
    } catch (error) {
      setMessages((prevMessages) => [
        ...prevMessages,
        {
          id: createMessageId(),
          role: "bot",
          type: "text",
          text: error.message || "Unable to fetch response from backend."
        }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const uploadPlantImage = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      alert("Please upload a valid image file.");
      event.target.value = "";
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      alert("Please upload an image smaller than 4MB.");
      event.target.value = "";
      return;
    }

    try {
      setIsSending(true);
      const imageUrl = await toDataUrl(file);

      setMessages((prevMessages) => [
        ...prevMessages,
        {
          id: createMessageId(),
          role: "user",
          type: "image",
          imageUrl,
          imageName: file.name
        }
      ]);

      const formData = new FormData();
      formData.append("image", file);

      const responseData = await apiRequest(CHAT_IMAGE_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      setMessages((prevMessages) => [
        ...prevMessages,
        {
          id: createMessageId(),
          role: "bot",
          type: "text",
          text: extractBotText(responseData)
        }
      ]);
    } catch (error) {
      setMessages((prevMessages) => [
        ...prevMessages,
        {
          id: createMessageId(),
          role: "bot",
          type: "text",
          text: error.message || "Unable to process image with backend."
        }
      ]);
    } finally {
      setIsSending(false);
    }

    event.target.value = "";
  };

  if (!currentUser || !token) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>{authMode === "login" ? "Login" : "Sign Up"}</h1>
          <p className="auth-subtitle">Access your farmer dashboard and chat history.</p>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {authMode === "signup" ? (
              <input
                type="text"
                name="name"
                placeholder="Full name"
                value={authForm.name}
                onChange={handleAuthInput}
              />
            ) : null}

            <input
              type="email"
              name="email"
              placeholder="Email"
              value={authForm.email}
              onChange={handleAuthInput}
            />

            <input
              type="password"
              name="password"
              placeholder="Password"
              value={authForm.password}
              onChange={handleAuthInput}
            />

            {authError ? <p className="auth-error">{authError}</p> : null}

            <button type="submit" className="auth-submit-btn" disabled={isAuthSubmitting}>
              {isAuthSubmitting
                ? "Please wait..."
                : authMode === "login"
                  ? "Login"
                  : "Create account"}
            </button>
          </form>

          <button
            type="button"
            className="auth-switch-btn"
            onClick={() => {
              setAuthMode((prevMode) => (prevMode === "login" ? "signup" : "login"));
              setAuthError("");
            }}
          >
            {authMode === "login" ? "New user? Sign up" : "Already have an account? Login"}
          </button>
        </section>
      </main>
    );
  }

  return (
    <div className="page">
      <header className="header">
        <h1>Namaste, {currentUser.name || "Farmer"} 👋</h1>
        <button className="logout-btn" onClick={logout}>Logout</button>
      </header>

      <section className="cards">
        <div className="card green">
          <h2>AI</h2>
          <p>Ask Krishi Mitra</p>
        </div>

        <div className="card blue">
          <h2>{weatherInfo.temperature === "--" ? "--" : `${weatherInfo.temperature}°C`}</h2>
          <p>{weatherInfo.alert}</p>
        </div>

        <div className="card brown">
          <h2>₹2500</h2>
          <p>Wheat Price</p>
        </div>
      </section>

      <section className="chat">
        <div className="chat-box">
          {messages.map((msg) => (
            <div key={msg.id} className={`message ${msg.role}`}>
              {msg.type === "image" ? (
                <div className="message-image-wrapper">
                  <img src={msg.imageUrl} alt={msg.imageName || "Uploaded plant"} className="message-image" />
                  {msg.imageName ? <p className="image-label">{msg.imageName}</p> : null}
                </div>
              ) : (
                msg.text
              )}
            </div>
          ))}
        </div>

        <div className="input-row">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about crop disease..."
            disabled={isSending}
          />
          <label className="upload-btn" htmlFor="plant-image-upload">
            Upload Plant Image
          </label>
          <input
            id="plant-image-upload"
            type="file"
            accept="image/*"
            onChange={uploadPlantImage}
            className="file-input"
            disabled={isSending}
          />
          <button onClick={sendMessage} disabled={isSending}>{isSending ? "Sending..." : "Send"}</button>
        </div>
      </section>

      <footer className="footer">
        <div>🏠 Home</div>
        <div>🔔 Notifications</div>
      </footer>
    </div>
  );
}