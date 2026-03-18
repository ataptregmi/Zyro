const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector(".nav-links");

if (navToggle && navLinks) {
  navToggle.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });
}

const storageKeys = {
  users: "regasUsers",
  session: "regasSession",
  sessionTemp: "regasSessionTemp",
  authStorage: "regasAuthStorage",
};

const readJson = (storage, key) => {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
};

const writeJson = (storage, key, value) => {
  storage.setItem(key, JSON.stringify(value));
};

const normalizeEmail = (value) => value.trim().toLowerCase();

const getUsers = () => readJson(localStorage, storageKeys.users) || [];
const setUsers = (users) => writeJson(localStorage, storageKeys.users, users);

const getLocalSession = () => {
  return (
    readJson(localStorage, storageKeys.session) ||
    readJson(sessionStorage, storageKeys.sessionTemp)
  );
};

const setLocalSession = (user, remember) => {
  if (remember) {
    writeJson(localStorage, storageKeys.session, user);
    sessionStorage.removeItem(storageKeys.sessionTemp);
  } else {
    writeJson(sessionStorage, storageKeys.sessionTemp, user);
    localStorage.removeItem(storageKeys.session);
  }
};

const clearLocalSession = () => {
  localStorage.removeItem(storageKeys.session);
  sessionStorage.removeItem(storageKeys.sessionTemp);
};

const getPreferredStorage = () => {
  if (sessionStorage.getItem(storageKeys.authStorage)) {
    return { type: "session", storage: sessionStorage };
  }
  if (localStorage.getItem(storageKeys.authStorage)) {
    return { type: "local", storage: localStorage };
  }
  return { type: "local", storage: localStorage };
};

const setPreferredStorage = (remember) => {
  if (remember) {
    localStorage.setItem(storageKeys.authStorage, "local");
    sessionStorage.removeItem(storageKeys.authStorage);
  } else {
    sessionStorage.setItem(storageKeys.authStorage, "session");
    localStorage.removeItem(storageKeys.authStorage);
  }
};

const clearPreferredStorage = () => {
  localStorage.removeItem(storageKeys.authStorage);
  sessionStorage.removeItem(storageKeys.authStorage);
};

const setMessage = (scope, message, type = "info") => {
  const target = document.querySelector(`[data-auth-message="${scope}"]`);
  if (!target) return;
  target.textContent = message;
  target.classList.remove("error", "success");
  if (type === "error") target.classList.add("error");
  if (type === "success") target.classList.add("success");
};

const setHandleMessage = (message, type = "info") => {
  const target = document.querySelector("[data-handle-status]");
  if (!target) return;
  target.textContent = message;
  target.classList.remove("error", "success");
  if (type === "error") target.classList.add("error");
  if (type === "success") target.classList.add("success");
};

const showAuthCard = (targetId) => {
  const cards = document.querySelectorAll("[data-auth-card]");
  if (cards.length === 0) return;
  const fallback = "login";
  const activeId = targetId || fallback;
  cards.forEach((card) => {
    const isActive = card.id === activeId;
    card.classList.toggle("is-hidden", !isActive);
  });
};

const getAuthTargetFromHash = () => {
  const hash = window.location.hash.replace("#", "");
  if (hash === "signup" || hash === "reset" || hash === "login") {
    return hash;
  }
  return "login";
};

const toggleResetMode = (mode) => {
  const requestForm = document.querySelector('[data-auth-form="reset-request"]');
  const confirmForm = document.querySelector('[data-auth-form="reset-confirm"]');
  if (!requestForm || !confirmForm) return;
  if (mode === "confirm") {
    requestForm.classList.add("is-hidden");
    confirmForm.classList.remove("is-hidden");
  } else {
    requestForm.classList.remove("is-hidden");
    confirmForm.classList.add("is-hidden");
  }
};

const assessStrength = (value) => {
  const length = value.length;
  let score = 0;
  if (length >= 6) score += 1;
  if (length >= 10) score += 1;
  if (/[A-Z]/.test(value)) score += 1;
  if (/[0-9]/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;

  const labels = ["Very weak", "Weak", "Okay", "Good", "Strong", "Excellent"];
  return {
    score,
    label: labels[score] || "Weak",
    percent: Math.min(100, (score / 5) * 100),
  };
};

const wireStrengthMeter = (input) => {
  if (!input) return;
  const wrapper = input.closest("label")?.parentElement;
  if (!wrapper) return;
  const meter = wrapper.querySelector(`[data-strength-for="${input.id}"]`);
  const bar = meter?.querySelector("[data-strength-bar]");
  const text = wrapper.querySelector("[data-strength-text]");
  if (!meter || !bar || !text) return;

  const update = () => {
    const { score, label, percent } = assessStrength(input.value);
    bar.style.width = `${percent}%`;
    if (score <= 1) bar.style.background = "#ff8a80";
    else if (score <= 3) bar.style.background = "#ffd180";
    else bar.style.background = "#b9f6ca";
    text.textContent = `Strength: ${label}`;
  };

  input.addEventListener("input", update);
  update();
};

const wirePasswordToggles = () => {
  document.querySelectorAll("[data-toggle-password]").forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.getAttribute("data-toggle-password");
      const input = document.getElementById(targetId);
      if (!input) return;
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      button.textContent = isPassword ? "Hide" : "Show";
    });
  });
};

const checkHandleAvailability = async (handle) => {
  if (!handle) return { available: false, reason: "Enter a gamer tag first." };
  const normalized = handle.toLowerCase();
  if (supabaseEnabled) {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from("profiles")
      .select("handle")
      .ilike("handle", normalized)
      .limit(1);

    if (error) {
      return { available: true, reason: "" };
    }
    return { available: data.length === 0, reason: "That gamer tag is taken." };
  }

  const users = getUsers();
  const taken = users.some((item) => item.handle.toLowerCase() === normalized);
  return { available: !taken, reason: "That gamer tag is taken." };
};

const supabaseConfig = window.REGAS_SUPABASE || {};
const supabaseEnabled =
  supabaseConfig.enabled !== false &&
  supabaseConfig.url &&
  supabaseConfig.anonKey &&
  window.supabase;

let supabaseClient = null;

const getSupabaseClient = () => {
  if (!supabaseEnabled) return null;
  const preferred = getPreferredStorage();
  if (!supabaseClient || supabaseClient._regasStorage !== preferred.type) {
    supabaseClient = window.supabase.createClient(
      supabaseConfig.url,
      supabaseConfig.anonKey,
      {
        auth: {
          persistSession: true,
          storage: preferred.storage,
        },
      }
    );
    supabaseClient._regasStorage = preferred.type;
  }
  return supabaseClient;
};

const updateNavForAuth = (sessionUser) => {
  if (!navLinks) return;

  const loginLink = navLinks.querySelector('a[href="auth.html"]');
  const signupLink = navLinks.querySelector('a[href="auth.html#signup"]');
  const existingProfile = navLinks.querySelector(".nav-auth-profile");
  const existingLogout = navLinks.querySelector(".nav-auth-logout");

  if (sessionUser) {
    if (loginLink) loginLink.style.display = "none";
    if (signupLink) signupLink.style.display = "none";

    if (!existingProfile) {
      const profileLink = document.createElement("a");
      profileLink.className = "nav-link nav-auth-profile";
      profileLink.href = "profile.html";
      profileLink.textContent = "Profile";
      navLinks.appendChild(profileLink);
    }

    if (!existingLogout) {
      const logoutButton = document.createElement("button");
      logoutButton.type = "button";
      logoutButton.className = "nav-link nav-auth-logout";
      logoutButton.textContent = "Logout";
      logoutButton.addEventListener("click", async () => {
        if (supabaseEnabled) {
          const sb = getSupabaseClient();
          if (sb) {
            await sb.auth.signOut();
          }
        } else {
          clearLocalSession();
        }
        clearPreferredStorage();
        window.location.href = "index.html";
      });
      navLinks.appendChild(logoutButton);
    }
  } else {
    if (loginLink) loginLink.style.display = "";
    if (signupLink) signupLink.style.display = "";
    if (existingProfile) existingProfile.remove();
    if (existingLogout) existingLogout.remove();
  }
};

const buildSessionUser = (user) => {
  if (!user) return null;
  const metadata = user.user_metadata || {};
  return {
    id: user.id,
    name: metadata.name || metadata.full_name || "REGAS Player",
    handle: metadata.handle || "@player",
    email: user.email,
    joinedAt: user.created_at || new Date().toISOString(),
  };
};

const hydrateProfile = (sessionUser) => {
  if (!sessionUser) return;
  const avatar = document.querySelector("[data-profile-avatar]");
  const handle = document.querySelector("[data-profile-handle]");
  const tagline = document.querySelector("[data-profile-tagline]");
  const joined = document.querySelector("[data-profile-joined]");

  if (avatar) {
    const initials = sessionUser.name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("");
    avatar.textContent =
      initials || sessionUser.handle.replace("@", "").slice(0, 2).toUpperCase();
  }
  if (handle) handle.textContent = sessionUser.handle;
  if (tagline) {
    tagline.textContent = `${sessionUser.name} is ready to upload their next highlight.`;
  }
  if (joined) {
    const date = new Date(sessionUser.joinedAt);
    if (!Number.isNaN(date.getTime())) {
      const label = date.toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
      });
      joined.textContent = `Joined ${label}`;
    }
  }
};

const fetchSupabaseProfile = async (user) => {
  const sb = getSupabaseClient();
  if (!sb || !user) return buildSessionUser(user);
  const { data, error } = await sb
    .from("profiles")
    .select("name, handle, joined_at")
    .eq("id", user.id)
    .single();

  if (error || !data) {
    return buildSessionUser(user);
  }

  return {
    id: user.id,
    name: data.name || user.user_metadata?.name || "REGAS Player",
    handle: data.handle || user.user_metadata?.handle || "@player",
    email: user.email,
    joinedAt: data.joined_at || user.created_at || new Date().toISOString(),
  };
};

const initAuth = async () => {
  const authForms = document.querySelectorAll("[data-auth-form]");
  const requiresAuth = document.body && document.body.dataset.requiresAuth === "true";
  const isProfile = document.body && document.body.dataset.page === "profile";

  showAuthCard(getAuthTargetFromHash());
  window.addEventListener("hashchange", () => {
    showAuthCard(getAuthTargetFromHash());
  });
  wirePasswordToggles();
  wireStrengthMeter(document.getElementById("signup-password"));
  wireStrengthMeter(document.getElementById("reset-new-password"));

  if (supabaseEnabled) {
    const sb = getSupabaseClient();
    const { data } = await sb.auth.getSession();
    const sessionUser = data?.session?.user ? await fetchSupabaseProfile(data.session.user) : null;
    const hashParams = new URLSearchParams(window.location.hash.replace("#", ""));
    const searchParams = new URLSearchParams(window.location.search);
    const isRecovery = hashParams.get("type") === "recovery" || searchParams.get("type") === "recovery";

    updateNavForAuth(sessionUser);

    if (requiresAuth && !sessionUser) {
      window.location.href = "auth.html";
      return;
    }

    if (isProfile) {
      hydrateProfile(sessionUser);
    }

    if (authForms.length > 0) {
      const loginForm = document.querySelector('[data-auth-form="login"]');
      const signupForm = document.querySelector('[data-auth-form="signup"]');
      const resetRequestForm = document.querySelector('[data-auth-form="reset-request"]');
      const resetConfirmForm = document.querySelector('[data-auth-form="reset-confirm"]');
      const handleInput = document.getElementById("signup-handle");

      toggleResetMode(isRecovery ? "confirm" : "request");
      if (isRecovery) {
        showAuthCard("reset");
      }

      if (handleInput) {
        let handleTimer = null;
        const checkAndReport = async () => {
          const handleRaw = handleInput.value.trim();
          const handle = handleRaw.startsWith("@") ? handleRaw : `@${handleRaw}`;
          if (!/^@[a-z0-9_]{3,18}$/i.test(handle)) {
            setHandleMessage("Use @tag (3-18 letters/numbers).", "error");
            return;
          }
          const result = await checkHandleAvailability(handle);
          if (result.available) {
            setHandleMessage("Gamer tag available.", "success");
          } else {
            setHandleMessage(result.reason, "error");
          }
        };

        handleInput.addEventListener("blur", checkAndReport);
        handleInput.addEventListener("input", () => {
          clearTimeout(handleTimer);
          handleTimer = setTimeout(checkAndReport, 450);
        });
      }

      if (loginForm) {
        loginForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const formData = new FormData(loginForm);
          const email = normalizeEmail(formData.get("email") || "");
          const password = String(formData.get("password") || "");
          const remember = Boolean(formData.get("remember"));

          if (!email || !password) {
            setMessage("login", "Enter your email and password to continue.", "error");
            return;
          }

          setPreferredStorage(remember);
          const client = getSupabaseClient();
          const { error } = await client.auth.signInWithPassword({ email, password });

          if (error) {
            setMessage("login", "We could not match those credentials.", "error");
            return;
          }

          setMessage("login", "Welcome back. Redirecting to your profile...", "success");
          setTimeout(() => {
            window.location.href = "profile.html";
          }, 700);
        });
      }

      if (signupForm) {
        signupForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const formData = new FormData(signupForm);
          const name = String(formData.get("name") || "").trim();
          const handleRaw = String(formData.get("handle") || "").trim();
          const email = normalizeEmail(formData.get("email") || "");
          const password = String(formData.get("password") || "");
          const confirm = String(formData.get("confirm") || "");

          const handle = handleRaw.startsWith("@") ? handleRaw : `@${handleRaw}`;
          const handleValid = /^@[a-z0-9_]{3,18}$/i.test(handle);

          if (!name || name.length < 2) {
            setMessage("signup", "Add a display name so people recognize you.", "error");
            return;
          }

          if (!handleValid) {
            setMessage("signup", "Choose a gamer tag like @player_01 (3-18 letters/numbers).", "error");
            return;
          }

          if (!email || !email.includes("@")) {
            setMessage("signup", "Use a valid email address to create your account.", "error");
            return;
          }

          if (password.length < 6) {
            setMessage("signup", "Passwords need at least 6 characters.", "error");
            return;
          }

          if (password !== confirm) {
            setMessage("signup", "Passwords do not match yet. Try again.", "error");
            return;
          }

          const handleAvailability = await checkHandleAvailability(handle);
          if (!handleAvailability.available) {
            setHandleMessage(handleAvailability.reason, "error");
            setMessage("signup", "Choose a different gamer tag.", "error");
            return;
          }

          setPreferredStorage(true);
          const client = getSupabaseClient();
          const { data, error } = await client.auth.signUp({
            email,
            password,
            options: {
              data: {
                name,
                handle,
              },
            },
          });

          if (error) {
            setMessage("signup", error.message || "Signup failed. Try again.", "error");
            return;
          }

          const user = data?.user;
          if (user) {
            const { error: profileError } = await client.from("profiles").upsert(
              {
                id: user.id,
                name,
                handle,
                email,
                joined_at: new Date().toISOString(),
              },
              { onConflict: "id" }
            );

            if (profileError) {
              setMessage(
                "signup",
                "Account created. Profile data will sync once the profiles table is ready.",
                "success"
              );
            } else {
              setMessage("signup", "Account created. Taking you to your profile...", "success");
            }
          }

          setTimeout(() => {
            window.location.href = "profile.html";
          }, 800);
        });
      }

      if (resetRequestForm) {
        resetRequestForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const formData = new FormData(resetRequestForm);
          const email = normalizeEmail(formData.get("email") || "");

          if (!email) {
            setMessage("reset", "Enter the email you used to register.", "error");
            return;
          }

          const redirectTo = `${window.location.origin}/auth.html#reset`;
          const client = getSupabaseClient();
          const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });

          if (error) {
            setMessage("reset", error.message || "Reset failed. Try again.", "error");
            return;
          }

          setMessage("reset", "Reset link sent. Check your email inbox.", "success");
        });
      }

      if (resetConfirmForm) {
        resetConfirmForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const formData = new FormData(resetConfirmForm);
          const password = String(formData.get("password") || "");
          const confirm = String(formData.get("confirm") || "");

          if (password.length < 6) {
            setMessage("reset-confirm", "Passwords need at least 6 characters.", "error");
            return;
          }

          if (password !== confirm) {
            setMessage("reset-confirm", "Passwords do not match yet. Try again.", "error");
            return;
          }

          const client = getSupabaseClient();
          const { error } = await client.auth.updateUser({ password });

          if (error) {
            setMessage("reset-confirm", error.message || "Reset failed. Try again.", "error");
            return;
          }

          setMessage("reset-confirm", "Password updated. Redirecting to login...", "success");
          await client.auth.signOut();
          setTimeout(() => {
            window.location.href = "auth.html#login";
          }, 800);
        });
      }

      document.querySelectorAll("[data-auth-action]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          const action = button.getAttribute("data-auth-action");
          if (action === "discord") {
            setMessage("login", "Discord login is coming soon. Use email for now.", "error");
          }
        });
      });
    }

    sb.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user;
      const sessionUser = user ? await fetchSupabaseProfile(user) : null;
      updateNavForAuth(sessionUser);
      if (isProfile) {
        hydrateProfile(sessionUser);
      }
    });

    return;
  }

  const sessionUser = getLocalSession();
  updateNavForAuth(sessionUser);

  if (requiresAuth && !sessionUser) {
    window.location.href = "auth.html";
    return;
  }

  if (isProfile) {
    hydrateProfile(sessionUser);
  }

  if (authForms.length > 0) {
    const loginForm = document.querySelector('[data-auth-form="login"]');
    const signupForm = document.querySelector('[data-auth-form="signup"]');
    const resetRequestForm = document.querySelector('[data-auth-form="reset-request"]');
    const resetConfirmForm = document.querySelector('[data-auth-form="reset-confirm"]');
    const handleInput = document.getElementById("signup-handle");

    toggleResetMode("request");

    if (handleInput) {
      let handleTimer = null;
      const checkAndReport = async () => {
        const handleRaw = handleInput.value.trim();
        const handle = handleRaw.startsWith("@") ? handleRaw : `@${handleRaw}`;
        if (!/^@[a-z0-9_]{3,18}$/i.test(handle)) {
          setHandleMessage("Use @tag (3-18 letters/numbers).", "error");
          return;
        }
        const result = await checkHandleAvailability(handle);
        if (result.available) {
          setHandleMessage("Gamer tag available.", "success");
        } else {
          setHandleMessage(result.reason, "error");
        }
      };

      handleInput.addEventListener("blur", checkAndReport);
      handleInput.addEventListener("input", () => {
        clearTimeout(handleTimer);
        handleTimer = setTimeout(checkAndReport, 450);
      });
    }

    if (loginForm) {
      loginForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const formData = new FormData(loginForm);
        const email = normalizeEmail(formData.get("email") || "");
        const password = String(formData.get("password") || "");
        const remember = Boolean(formData.get("remember"));

        if (!email || !password) {
          setMessage("login", "Enter your email and password to continue.", "error");
          return;
        }

        const users = getUsers();
        const user = users.find((item) => item.email === email);

        if (!user || user.password !== password) {
          setMessage("login", "We could not match those credentials.", "error");
          return;
        }

        setLocalSession(
          {
            name: user.name,
            handle: user.handle,
            email: user.email,
            joinedAt: user.joinedAt,
          },
          remember
        );
        setMessage("login", "Welcome back. Redirecting to your profile...", "success");
        setTimeout(() => {
          window.location.href = "profile.html";
        }, 700);
      });
    }

    if (signupForm) {
      signupForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(signupForm);
        const name = String(formData.get("name") || "").trim();
        const handleRaw = String(formData.get("handle") || "").trim();
        const email = normalizeEmail(formData.get("email") || "");
        const password = String(formData.get("password") || "");
        const confirm = String(formData.get("confirm") || "");

        const handle = handleRaw.startsWith("@") ? handleRaw : `@${handleRaw}`;
        const handleValid = /^@[a-z0-9_]{3,18}$/i.test(handle);

        if (!name || name.length < 2) {
          setMessage("signup", "Add a display name so people recognize you.", "error");
          return;
        }

        if (!handleValid) {
          setMessage("signup", "Choose a gamer tag like @player_01 (3-18 letters/numbers).", "error");
          return;
        }

        if (!email || !email.includes("@")) {
          setMessage("signup", "Use a valid email address to create your account.", "error");
          return;
        }

        if (password.length < 6) {
          setMessage("signup", "Passwords need at least 6 characters.", "error");
          return;
        }

        if (password !== confirm) {
          setMessage("signup", "Passwords do not match yet. Try again.", "error");
          return;
        }

        const handleAvailability = await checkHandleAvailability(handle);
        if (!handleAvailability.available) {
          setHandleMessage(handleAvailability.reason, "error");
          setMessage("signup", "Choose a different gamer tag.", "error");
          return;
        }

        const users = getUsers();
        const emailExists = users.some((item) => item.email === email);
        const handleExists = users.some((item) => item.handle.toLowerCase() === handle.toLowerCase());

        if (emailExists) {
          setMessage("signup", "That email is already registered. Try logging in.", "error");
          return;
        }

        if (handleExists) {
          setMessage("signup", "That gamer tag is taken. Try a different one.", "error");
          return;
        }

        const newUser = {
          id: `user_${Date.now()}`,
          name,
          handle,
          email,
          password,
          joinedAt: new Date().toISOString(),
        };

        users.push(newUser);
        setUsers(users);
        setLocalSession(
          {
            name: newUser.name,
            handle: newUser.handle,
            email: newUser.email,
            joinedAt: newUser.joinedAt,
          },
          true
        );
        setMessage("signup", "Account created. Taking you to your profile...", "success");
        setTimeout(() => {
          window.location.href = "profile.html";
        }, 700);
      });
    }

    if (resetRequestForm) {
      resetRequestForm.addEventListener("submit", (event) => {
        event.preventDefault();
        setMessage("reset", "Password resets require the hosted backend.", "error");
      });
    }

    if (resetConfirmForm) {
      resetConfirmForm.addEventListener("submit", (event) => {
        event.preventDefault();
        setMessage("reset-confirm", "Password resets require the hosted backend.", "error");
      });
    }

    document.querySelectorAll("[data-auth-action]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        const action = button.getAttribute("data-auth-action");
        if (action === "discord") {
          setMessage("login", "Discord login is coming soon. Use email for now.", "error");
        }
        if (action === "reset") {
          setMessage("login", "Password resets are coming soon. Create a new account for now.", "error");
        }
      });
    });
  }
};

initAuth();

const reels = Array.from(document.querySelectorAll(".reel-full"));

if (reels.length > 0) {
  let isSnapping = false;
  window.addEventListener(
    "wheel",
    (event) => {
      if (isSnapping) return;
      if (Math.abs(event.deltaY) < 4) return;

      const currentIndex = reels.findIndex((reel) => {
        const rect = reel.getBoundingClientRect();
        return rect.top >= -10 && rect.top < window.innerHeight * 0.5;
      });

      const direction = event.deltaY > 0 ? 1 : -1;
      const nextIndex =
        currentIndex === -1
          ? 0
          : Math.max(0, Math.min(reels.length - 1, currentIndex + direction));

      if (nextIndex === currentIndex) return;

      isSnapping = true;
      reels[nextIndex].scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => {
        isSnapping = false;
      }, 650);
    },
    { passive: true }
  );
}


