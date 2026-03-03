import { useEffect, useState } from "react";
import "./App.css";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8081").replace(/\/$/, "");
const FARMER_ASK_ENDPOINT = import.meta.env.VITE_FARMER_ASK_ENDPOINT || "/api/farmer/ask";
const CHAT_IMAGE_ENDPOINT = import.meta.env.VITE_CHAT_IMAGE_ENDPOINT || "/api/chat/images";
const WEATHER_CURRENT_ENDPOINT = import.meta.env.VITE_WEATHER_CURRENT_ENDPOINT || "/api/weather/current";
const WEATHER_FORECAST_ENDPOINT = import.meta.env.VITE_WEATHER_FORECAST_ENDPOINT || "/api/weather/forecast";
const WEATHER_DEFAULT_LOCATION = import.meta.env.VITE_WEATHER_LOCATION || "Hyderabad";
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
  const condition = payload?.condition || payload?.alert || payload?.description || "No weather data";
  const humidity = payload?.humidity ?? "--";
  const windSpeed = payload?.windSpeed ?? payload?.wind ?? "--";
  const location = payload?.location || WEATHER_DEFAULT_LOCATION;

  return {
    temperature,
    condition: Array.isArray(condition) ? condition[0] || "No weather data" : condition,
    humidity,
    windSpeed,
    location
  };
};

const isRainCondition = (condition = "") => /rain|drizzle|shower|storm|thunder/i.test(condition);

const extractForecastItems = (responseData) => {
  const payload = responseData?.data || responseData;
  return Array.isArray(payload) ? payload : [];
};

const formatAlertTime = (timestamp) => {
  if (!timestamp) {
    return "soon";
  }

  const parsedDate = new Date(timestamp);
  if (Number.isNaN(parsedDate.getTime())) {
    return String(timestamp);
  }

  return parsedDate.toLocaleString([], {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  });
};

const buildWeatherAlerts = (currentWeather, forecastItems) => {
  const alerts = [];
  const humidityValue = Number(currentWeather?.humidity);
  const temperatureValue = Number(currentWeather?.temperature);
  const currentCondition = currentWeather?.condition || "";

  if (isRainCondition(currentCondition)) {
    alerts.push({
      id: "immediate-rain",
      severity: "high",
      title: "Immediate rain warning",
      message: `Current condition is ${currentCondition}. Consider protecting harvested crop and equipment now.`
    });
  }

  if (!Number.isNaN(humidityValue) && humidityValue <= 30) {
    alerts.push({
      id: "dryness",
      severity: "medium",
      title: "Extreme dryness alert",
      message: `Humidity is ${humidityValue}%. Soil can dry quickly; consider irrigation scheduling.`
    });
  }

  if (!Number.isNaN(humidityValue) && humidityValue >= 85) {
    alerts.push({
      id: "high-humidity",
      severity: "medium",
      title: "High humidity alert",
      message: `Humidity is ${humidityValue}%. Disease risk may increase for sensitive crops.`
    });
  }

  if (!Number.isNaN(temperatureValue) && temperatureValue >= 38) {
    alerts.push({
      id: "heat-stress",
      severity: "high",
      title: "Heat stress warning",
      message: `Temperature is ${temperatureValue}°C. Irrigate and avoid midday spray activity.`
    });
  }

  const nextRain = forecastItems.find((item) => isRainCondition(item?.condition || ""));
  if (nextRain) {
    alerts.push({
      id: "next-rain",
      severity: "low",
      title: "Next rain expected",
      message: `${nextRain.condition || "Rain"} expected around ${formatAlertTime(nextRain.timestamp)}.`
    });
  }

  if (!alerts.length) {
    alerts.push({
      id: "no-critical-alert",
      severity: "low",
      title: "No immediate weather risks",
      message: "No rain, extreme dryness, or high humidity warnings at the moment."
    });
  }

  return alerts;
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
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isNotificationsLoading, setIsNotificationsLoading] = useState(false);
  const [weatherAlerts, setWeatherAlerts] = useState([]);
  const [weatherInfo, setWeatherInfo] = useState({
    temperature: "--",
    condition: "Loading weather...",
    humidity: "--",
    windSpeed: "--",
    location: WEATHER_DEFAULT_LOCATION
  });

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
        const responseData = await apiRequest(
          `${WEATHER_CURRENT_ENDPOINT}?location=${encodeURIComponent(WEATHER_DEFAULT_LOCATION)}`,
          {
          method: "GET"
          }
        );
        setWeatherInfo(extractWeatherCardData(responseData));
      } catch {
        setWeatherInfo({
          temperature: "--",
          condition: "Weather service unavailable",
          humidity: "--",
          windSpeed: "--",
          location: WEATHER_DEFAULT_LOCATION
        });
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
    setWeatherAlerts([]);
    setIsNotificationsOpen(false);
    setWeatherInfo({
      temperature: "--",
      condition: "Loading weather...",
      humidity: "--",
      windSpeed: "--",
      location: WEATHER_DEFAULT_LOCATION
    });
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

  const openNotifications = async () => {
    if (!token) {
      return;
    }

    const nextOpenState = !isNotificationsOpen;
    setIsNotificationsOpen(nextOpenState);

    if (!nextOpenState) {
      return;
    }

    setIsNotificationsLoading(true);

    try {
      const [currentResponse, forecastResponse] = await Promise.all([
        apiRequest(
          `${WEATHER_CURRENT_ENDPOINT}?location=${encodeURIComponent(WEATHER_DEFAULT_LOCATION)}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        ),
        apiRequest(
          `${WEATHER_FORECAST_ENDPOINT}?location=${encodeURIComponent(WEATHER_DEFAULT_LOCATION)}&days=7`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        )
      ]);

      const currentData = extractWeatherCardData(currentResponse);
      const forecastItems = extractForecastItems(forecastResponse);
      setWeatherAlerts(buildWeatherAlerts(currentData, forecastItems));
    } catch {
      setWeatherAlerts([
        {
          id: "weather-fetch-error",
          severity: "high",
          title: "Unable to load weather alerts",
          message: "Please try again. Weather service may be temporarily unavailable."
        }
      ]);
    } finally {
      setIsNotificationsLoading(false);
    }
  };

  if (!currentUser || !token) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>{authMode === "login" ? "LOGIN" : "SIGN UP"}</h1>
          <p className="auth-subtitle">Access your farmer dashboard terminal</p>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {authMode === "signup" ? (
              <input
                type="text"
                name="name"
                placeholder="Enter full name..."
                value={authForm.name}
                onChange={handleAuthInput}
              />
            ) : null}

            <input
              type="email"
              name="email"
              placeholder="Enter email..."
              value={authForm.email}
              onChange={handleAuthInput}
            />

            <input
              type="password"
              name="password"
              placeholder="Enter password..."
              value={authForm.password}
              onChange={handleAuthInput}
            />

            {authError ? <p className="auth-error">{authError}</p> : null}

            <button type="submit" className="auth-submit-btn" disabled={isAuthSubmitting}>
              {isAuthSubmitting
                ? "LOADING..."
                : authMode === "login"
                  ? "[ ENTER ]"
                  : "[ CREATE ]"}
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
            {authMode === "login" ? "» New user? Create account" : "» Already registered? Login"}
          </button>
        </section>
      </main>
    );
  }

  return (
    <div className="page">
      <header className="header">
        <h1>NAMASTE, {(currentUser.name || "Farmer").toUpperCase()}</h1>
        <button className="logout-btn" onClick={logout}>[ LOGOUT ]</button>
      </header>

      <section className="weather-dashboard">
        <div className="weather-main">
          <div>
            <div className="weather-temp">
              <h2>{weatherInfo.temperature === "--" ? "--" : weatherInfo.temperature}</h2>
              <span>°C</span>
            </div>
            <p className="weather-condition">{weatherInfo.condition}</p>
          </div>
          <div className="weather-stats">
            <div className="weather-stat">
              <div className="weather-stat-value">{weatherInfo.humidity === "--" ? "--" : `${weatherInfo.humidity}%`}</div>
              <div className="weather-stat-label">Humidity</div>
            </div>
            <div className="weather-stat">
              <div className="weather-stat-value">{weatherInfo.windSpeed === "--" ? "--" : weatherInfo.windSpeed}</div>
              <div className="weather-stat-label">Wind km/h</div>
            </div>
          </div>
        </div>
        <div className="weather-location">📍 {weatherInfo.location}</div>
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
            placeholder="Enter query about crops, disease, weather..."
            disabled={isSending}
          />
          <label className="upload-btn" htmlFor="plant-image-upload">
            [ UPLOAD ]
          </label>
          <input
            id="plant-image-upload"
            type="file"
            accept="image/*"
            onChange={uploadPlantImage}
            className="file-input"
            disabled={isSending}
          />
          <button onClick={sendMessage} disabled={isSending}>{isSending ? "..." : "SEND"}</button>
        </div>
      </section>

      <footer className="footer">
        <button 
          type="button" 
          className={`footer-notifications-btn ${weatherAlerts.length > 0 && weatherAlerts[0].id !== 'no-critical-alert' ? 'has-alerts' : ''}`}
          onClick={openNotifications}
        >
          [ ALERTS ]
        </button>
      </footer>

      {isNotificationsOpen ? (
        <section className="notifications-panel">
          <h3>Weather Alerts</h3>

          {isNotificationsLoading ? (
            <p className="notifications-empty">Loading alerts...</p>
          ) : (
            <div className="notifications-list">
              {weatherAlerts.map((alert) => (
                <article key={alert.id} className={`notification-item ${alert.severity}`}>
                  <h4>{alert.title}</h4>
                  <p>{alert.message}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}