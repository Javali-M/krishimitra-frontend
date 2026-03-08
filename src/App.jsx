import { useEffect, useRef, useState } from "react";
import "./App.css";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8081").replace(/\/$/, "");
const AUTH_BASE_URL = (import.meta.env.VITE_AUTH_BASE_URL || "http://localhost:8082").replace(/\/$/, "");
const AGENT_BASE_URL = (import.meta.env.VITE_AGENT_BASE_URL || "http://localhost:8082").replace(/\/$/, "");
const FARMER_ASK_ENDPOINT = import.meta.env.VITE_FARMER_ASK_ENDPOINT || "/api/farmer/ask";
const CHAT_IMAGE_ENDPOINT = import.meta.env.VITE_CHAT_IMAGE_ENDPOINT || "/api/chat/images";
const WEATHER_CURRENT_ENDPOINT = import.meta.env.VITE_WEATHER_CURRENT_ENDPOINT || "/api/weather/current";
const WEATHER_FORECAST_ENDPOINT = import.meta.env.VITE_WEATHER_FORECAST_ENDPOINT || "/api/weather/forecast";
const WEATHER_DEFAULT_LOCATION = import.meta.env.VITE_WEATHER_LOCATION || "Hyderabad";
const AUTH_SIGNUP_ENDPOINT = import.meta.env.VITE_AUTH_SIGNUP_ENDPOINT || "/auth/signup";
const AUTH_LOGIN_ENDPOINT = import.meta.env.VITE_AUTH_LOGIN_ENDPOINT || "/auth/login";
const AUTH_LOGOUT_ENDPOINT = import.meta.env.VITE_AUTH_LOGOUT_ENDPOINT || "/auth/logout";
const AGENT_ASK_ENDPOINT = import.meta.env.VITE_AGENT_ASK_ENDPOINT || "/agent/ask";
const TOKEN_STORAGE_KEY = "farmai_auth_token";
const USER_STORAGE_KEY = "farmai_auth_user";
const LOCATION_STORAGE_KEY = "farmai_user_location";

const createMessageId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const buildApiUrl = (path, baseUrl = API_BASE_URL) => {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  return `${baseUrl}${path}`;
};

const apiRequest = async (path, options = {}, baseUrl = API_BASE_URL) => {
  const response = await fetch(buildApiUrl(path, baseUrl), {
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

const formatMarkdown = (text) => {
  return text
    // Insert newline before markdown list items (- **...**)
    .replace(/(?<!\n)-\s*\*\*/g, '\n- **')
    // Insert newline before bold headings like **Name:** that aren't already at line start
    .replace(/(?<=\S)(\*\*[A-Za-z\s]+?:\*\*)/g, '\n$1')
    // numbered list items: "1." "2." etc not at start
    .replace(/(?<=\S)(\d+\.\s)/g, '\n$1')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // Newlines to <br>
    .replace(/\n/g, '<br/>');
};

const parseAgentResponse = (text) => {
  if (!text) return [];

  const sections = [];
  let remaining = text;

  // Pattern: "LLM requested tool: <tool>" segments
  const toolRequestPattern = /LLM requested tool:\s*(\S+)/g;
  // Pattern: "result:" segments
  const resultPattern = /result:\s*/gi;
  // Pattern: "Final Answer:" segment
  const finalAnswerPattern = /Final Answer:\s*/gi;

  // Split by known markers
  const markers = [];
  const markerRegex = /(LLM requested tool:\s*\S+|(?:^|\s)result:\s*|Final Answer:\s*)/gi;
  let match;
  while ((match = markerRegex.exec(remaining)) !== null) {
    markers.push({ index: match.index, text: match[0].trim(), length: match[0].length });
  }

  if (markers.length === 0) {
    // No agent markers found, return as plain text
    return [{ type: "text", content: text }];
  }

  // Text before first marker
  const preamble = remaining.slice(0, markers[0].index).trim();
  if (preamble) {
    sections.push({ type: "text", content: preamble });
  }

  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    const contentStart = marker.index + marker.length;
    const contentEnd = i + 1 < markers.length ? markers[i + 1].index : remaining.length;
    const content = remaining.slice(contentStart, contentEnd).trim();

    if (marker.text.toLowerCase().startsWith("llm requested tool:")) {
      const toolName = marker.text.replace(/LLM requested tool:\s*/i, "");
      sections.push({ type: "tool-call", tool: toolName, content });
    } else if (marker.text.toLowerCase().startsWith("result:") || marker.text.toLowerCase().startsWith("result:")) {
      sections.push({ type: "tool-result", content });
    } else if (marker.text.toLowerCase().startsWith("final answer:")) {
      sections.push({ type: "final-answer", content });
    }
  }

  return sections;
};

const AgentMessage = ({ text }) => {
  const sections = parseAgentResponse(text);

  // If no structured sections, render as plain text
  if (sections.length === 1 && sections[0].type === "text") {
    return <span dangerouslySetInnerHTML={{ __html: formatMarkdown(sections[0].content) }} />;
  }

  return (
    <div className="agent-response">
      {sections.map((section, idx) => {
        if (section.type === "tool-call") {
          return (
            <div key={idx} className="agent-step agent-tool-call">
              <div className="agent-step-header">
                <span className="agent-step-icon">🔧</span>
                <span className="agent-step-label">Using tool</span>
                <span className="agent-tool-name">{section.tool}</span>
              </div>
              {section.content && (
                <div className="agent-step-body" dangerouslySetInnerHTML={{ __html: formatMarkdown(section.content) }} />
              )}
            </div>
          );
        }
        if (section.type === "tool-result") {
          return (
            <div key={idx} className="agent-step agent-tool-result">
              <div className="agent-step-header">
                <span className="agent-step-icon">📋</span>
                <span className="agent-step-label">Tool result</span>
              </div>
              <div className="agent-step-body" dangerouslySetInnerHTML={{ __html: formatMarkdown(section.content) }} />
            </div>
          );
        }
        if (section.type === "final-answer") {
          return (
            <div key={idx} className="agent-step agent-final-answer">
              <div className="agent-step-header">
                <span className="agent-step-icon">✅</span>
                <span className="agent-step-label">Answer</span>
              </div>
              <div className="agent-step-body" dangerouslySetInnerHTML={{ __html: formatMarkdown(section.content) }} />
            </div>
          );
        }
        return (
          <div key={idx} className="agent-step agent-text">
            <span dangerouslySetInnerHTML={{ __html: formatMarkdown(section.content) }} />
          </div>
        );
      })}
    </div>
  );
};

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
  const [userLocation, setUserLocation] = useState(() => {
    try {
      const saved = localStorage.getItem(LOCATION_STORAGE_KEY);
      return saved ? JSON.parse(saved) : { lat: null, lon: null, name: WEATHER_DEFAULT_LOCATION };
    } catch {
      return { lat: null, lon: null, name: WEATHER_DEFAULT_LOCATION };
    }
  });
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [authError, setAuthError] = useState("");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);
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

  const chatBoxRef = useRef(null);

  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [messages]);

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
    if (userLocation) {
      localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(userLocation));
    }
  }, [token, currentUser, userLocation]);

  const getLocationQuery = () => {
    if (userLocation.lat && userLocation.lon) {
      return `${userLocation.lat},${userLocation.lon}`;
    }
    return userLocation.name || WEATHER_DEFAULT_LOCATION;
  };

  useEffect(() => {
    if (!token) {
      return;
    }

    const fetchWeatherAlerts = async () => {
      try {
        const locationQuery = getLocationQuery();
        const responseData = await apiRequest(
          `${WEATHER_CURRENT_ENDPOINT}?location=${encodeURIComponent(locationQuery)}`,
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
  }, [token, userLocation]);

  const handleAuthInput = (event) => {
    const { name, value } = event.target;
    setAuthForm((prevForm) => ({ ...prevForm, [name]: value }));
  };

  const detectLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation not supported by your browser.");
      return;
    }

    setIsDetectingLocation(true);
    setLocationError("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const newLocation = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          name: `${position.coords.latitude.toFixed(2)}, ${position.coords.longitude.toFixed(2)}`
        };
        setUserLocation(newLocation);
        localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(newLocation));
        setIsDetectingLocation(false);
      },
      (error) => {
        setLocationError("Unable to detect location. Please enter manually.");
        setIsDetectingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleLocationNameChange = (e) => {
    const name = e.target.value;
    setUserLocation((prev) => ({ ...prev, name, lat: null, lon: null }));
  };

  const saveLocationName = () => {
    if (userLocation.name.trim()) {
      localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(userLocation));
    }
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
      }, AUTH_BASE_URL);

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
      }, AUTH_BASE_URL);
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

  const streamAgentResponse = async (botMessageId, response) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    let displayedLength = 0;
    let streamDone = false;

    // Collect SSE data in background
    const readStream = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data:")) {
            const data = line.slice(5).trim();
            if (data && data !== "[DONE]") {
              fullText += data;
            }
          } else if (line.trim() && !line.startsWith(":")) {
            fullText += line;
          }
        }
      }
      streamDone = true;
    };

    // Typewriter: reveal characters gradually
    const typewrite = () =>
      new Promise((resolve) => {
        const CHARS_PER_TICK = 3;
        const TICK_MS = 16;

        const tick = () => {
          if (displayedLength < fullText.length) {
            displayedLength = Math.min(displayedLength + CHARS_PER_TICK, fullText.length);
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === botMessageId
                  ? { ...msg, text: fullText.slice(0, displayedLength) }
                  : msg
              )
            );
            setTimeout(tick, TICK_MS);
          } else if (!streamDone) {
            // Waiting for more data from stream
            setTimeout(tick, TICK_MS);
          } else {
            // Stream finished and all text revealed
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === botMessageId ? { ...msg, text: fullText } : msg
              )
            );
            resolve();
          }
        };
        tick();
      });

    // Run both concurrently
    await Promise.all([readStream(), typewrite()]);

    return fullText;
  };

  const sendMessage = async () => {
    const userText = question.trim();
    const hasImage = !!pendingImage;

    if ((!userText && !hasImage) || isSending || !token) return;

    const currentImage = pendingImage;
    setQuestion("");
    setPendingImage(null);
    setIsSending(true);

    // Add user message(s)
    if (hasImage) {
      const imageUrl = await toDataUrl(currentImage.file);
      setMessages((prev) => [
        ...prev,
        {
          id: createMessageId(),
          role: "user",
          type: "image",
          imageUrl,
          imageName: currentImage.file.name
        },
        ...(userText
          ? [{ id: createMessageId(), role: "user", type: "text", text: userText }]
          : [])
      ]);
    } else {
      setMessages((prev) => [
        ...prev,
        { id: createMessageId(), role: "user", type: "text", text: userText }
      ]);
    }

    const botMessageId = createMessageId();
    setMessages((prev) => [
      ...prev,
      { id: botMessageId, role: "bot", type: "text", text: "" }
    ]);

    try {
      const formData = new FormData();
      formData.append("message", userText || `Analyze this crop/plant image: ${currentImage.file.name}`);
      if (hasImage) {
        formData.append("images", currentImage.file);
      }

      const url = buildApiUrl(AGENT_ASK_ENDPOINT, AGENT_BASE_URL);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "text/event-stream",
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const accumulatedText = await streamAgentResponse(botMessageId, response);

      if (!accumulatedText.trim()) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === botMessageId
              ? { ...msg, text: "I received your request successfully." }
              : msg
          )
        );
      }
    } catch (error) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === botMessageId
            ? { ...msg, text: error.message || "Unable to fetch response from backend." }
            : msg
        )
      );
    } finally {
      setIsSending(false);
    }
  };

  const uploadPlantImage = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please upload a valid image file.");
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      alert("Please upload an image smaller than 4MB.");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setPendingImage({ file, previewUrl });
  };

  const removePendingImage = () => {
    if (pendingImage) {
      URL.revokeObjectURL(pendingImage.previewUrl);
      setPendingImage(null);
    }
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
      const locationQuery = getLocationQuery();
      const [currentResponse, forecastResponse] = await Promise.all([
        apiRequest(
          `${WEATHER_CURRENT_ENDPOINT}?location=${encodeURIComponent(locationQuery)}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        ),
        apiRequest(
          `${WEATHER_FORECAST_ENDPOINT}?location=${encodeURIComponent(locationQuery)}&days=7`,
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

          <div className="location-section">
            <p className="location-label">📍 Your Farm Location</p>
            <div className="location-input-row">
              <input
                type="text"
                placeholder="Enter city or region..."
                value={userLocation.name}
                onChange={handleLocationNameChange}
                onBlur={saveLocationName}
                className="location-input"
              />
              <button
                type="button"
                className="detect-location-btn"
                onClick={detectLocation}
                disabled={isDetectingLocation}
              >
                {isDetectingLocation ? "..." : "📍 AUTO"}
              </button>
            </div>
            {userLocation.lat && userLocation.lon ? (
              <p className="location-coords">✓ Coordinates: {userLocation.lat.toFixed(4)}, {userLocation.lon.toFixed(4)}</p>
            ) : null}
            {locationError ? <p className="location-error">{locationError}</p> : null}
          </div>

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
        <div className="chat-box" ref={chatBoxRef}>
          {messages.map((msg) => (
            <div key={msg.id} className={`message ${msg.role}`}>
              {msg.type === "image" ? (
                <div className="message-image-wrapper">
                  <img src={msg.imageUrl} alt={msg.imageName || "Uploaded plant"} className="message-image" />
                  {msg.imageName ? <p className="image-label">{msg.imageName}</p> : null}
                </div>
              ) : msg.role === "bot" ? (
                <AgentMessage text={msg.text} />
              ) : (
                msg.text
              )}
            </div>
          ))}
        </div>

        {pendingImage && (
          <div className="pending-image-preview">
            <div className="pending-image-thumb">
              <img src={pendingImage.previewUrl} alt="Attached" />
              <button
                className="pending-image-remove"
                onClick={removePendingImage}
                disabled={isSending}
                title="Remove image"
              >
                ✕
              </button>
            </div>
            <span className="pending-image-name">{pendingImage.file.name}</span>
          </div>
        )}

        <div className="input-row">
          <label className="upload-btn" htmlFor="plant-image-upload" title="Attach image">
            📷
          </label>
          <input
            id="plant-image-upload"
            type="file"
            accept="image/*"
            onChange={uploadPlantImage}
            className="file-input"
            disabled={isSending}
          />
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={pendingImage ? "Add a message about this image..." : "Enter query about crops, disease, weather..."}
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