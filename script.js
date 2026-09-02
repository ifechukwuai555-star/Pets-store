/* =========================================================
   PET STORE — JAVASCRIPT
   Customer features + Owner dashboard + API connection
   ========================================================= */

/*
  IMPORTANT:
  For GitHub Pages + a separate backend, set:

  window.PET_STORE_API_URL = "YOUR-BACKEND-URL";

  before this script loads, or change API_BASE below.
*/

const API_BASE = window.PET_STORE_API_URL || "";


/* =========================================================
   BASIC HELPERS
   ========================================================= */

const $ = (selector) => document.querySelector(selector);

const $$ = (selector) => document.querySelectorAll(selector);

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatPrice(price) {
  const number = Number(price);

  if (Number.isNaN(number)) {
    return escapeHTML(price);
  }

  return `₦${number.toLocaleString("en-NG")}`;
}

function formatDate(date) {
  if (!date) return "";

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return escapeHTML(date);
  }

  return parsed.toLocaleString("en-NG");
}

async function apiRequest(endpoint, options = {}) {
  const config = {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(options.headers || {})
    }
  };

  const response = await fetch(`${API_BASE}${endpoint}`, config);

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data.message || data.error || `Request failed (${response.status})`
    );
  }

  return data;
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function setupNavigation() {
  $$(".nav-links a, a[href^='#']").forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href");

      if (!href || !href.startsWith("#")) {
        return;
      }

      const target = $(href);

      if (!target) {
        return;
      }

      event.preventDefault();

      target.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  });
}


/* =========================================================
   CUSTOMER PETS
   ========================================================= */

async function loadPets() {
  const petGrid = $("#petGrid");
  const loadingMessage = $("#petsLoading");
  const emptyMessage = $("#petsEmpty");

  if (!petGrid) return;

  if (loadingMessage) {
    loadingMessage.classList.remove("hidden");
  }

  if (emptyMessage) {
    emptyMessage.classList.add("hidden");
  }

  try {
    const data = await apiRequest("/api/pets");

    const pets = Array.isArray(data)
      ? data
      : Array.isArray(data.pets)
        ? data.pets
        : [];

    if (loadingMessage) {
      loadingMessage.classList.add("hidden");
    }

    if (pets.length === 0) {
      petGrid.innerHTML = "";

      if (emptyMessage) {
        emptyMessage.classList.remove("hidden");
      }

      return;
    }

    petGrid.innerHTML = pets.map(createPetCard).join("");

    attachPetEvents();

  } catch (error) {
    console.error("Could not load pets:", error);

    if (loadingMessage) {
      loadingMessage.classList.add("hidden");
    }

    petGrid.innerHTML = `
      <div class="message error">
        Unable to load pets right now. Please try again later.
      </div>
    `;
  }
}

function createPetCard(pet) {
  const id = escapeHTML(pet.id);
  const name = escapeHTML(pet.name);
  const category = escapeHTML(pet.category);
  const description = escapeHTML(pet.description);
  const price = formatPrice(pet.price);
  const likes = Number(pet.likes || 0);

  const image =
    pet.image_url ||
    pet.imageUrl ||
    "https://placehold.co/800x500?text=Pet";

  return `
    <article class="pet-card" data-pet-id="${id}">

      <img
        src="${escapeHTML(image)}"
        alt="${name}"
        class="pet-image"
        data-pet-id="${id}"
      >

      <div class="pet-card-content">

        <h3>${name}</h3>

        <p>
          <strong>Category:</strong>
          ${category}
        </p>

        <p>${description}</p>

        <div class="pet-price">
          ${price}
        </div>

        <p>
          ❤️ <span class="like-count">${likes}</span> likes
        </p>

        <div class="pet-actions">

          <button
            class="btn btn-secondary inquire-pet-btn"
            type="button"
            data-pet="${name}"
          >
            Inquire
          </button>

          <button
            class="btn btn-primary like-pet-btn"
            type="button"
            data-id="${id}"
          >
            ❤️ Like
          </button>

        </div>

      </div>
    </article>
  `;
}

function attachPetEvents() {
  $$(".pet-image").forEach((image) => {
    image.addEventListener("click", () => {
      const petName =
        image.closest(".pet-card")?.querySelector("h3")?.textContent || "";

      selectPetForInquiry(petName);
    });
  });

  $$(".inquire-pet-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const petName = button.dataset.pet || "";

      selectPetForInquiry(petName);
    });
  });

  $$(".like-pet-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      await likePet(button);
    });
  });
}


/* =========================================================
   PET INQUIRY SELECTION
   ========================================================= */

function selectPetForInquiry(petName) {
  const petInput = $("#inquiryPet");
  const inquirySection = $("#inquiry");

  if (petInput) {
    petInput.value = petName;
  }

  if (inquirySection) {
    inquirySection.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  setTimeout(() => {
    const nameInput = $("#inquiryName");

    if (nameInput) {
      nameInput.focus();
    }
  }, 500);
}


/* =========================================================
   PET LIKES
   ========================================================= */

async function likePet(button) {
  const petId = button.dataset.id;

  if (!petId) return;

  button.disabled = true;

  try {
    const data = await apiRequest(
      `/api/pets/${encodeURIComponent(petId)}/like`,
      {
        method: "POST"
      }
    );

    const card = button.closest(".pet-card");
    const count = card?.querySelector(".like-count");

    if (count && data.likes !== undefined) {
      count.textContent = data.likes;
    }

    button.textContent = "❤️ Liked";

  } catch (error) {
    console.error("Like failed:", error);

    button.disabled = false;

    alert("Sorry, we could not record your like. Please try again.");
  }
}


/* =========================================================
   INQUIRY FORM
   ========================================================= */

function setupInquiryForm() {
  const form = $("#inquiryForm");

  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = form.querySelector("button[type='submit']");
    const successBox = $("#inquirySuccess");
    const status = $("#inquiryMessageStatus");

    const formData = new FormData(form);

    const payload = {
      name: formData.get("name")?.trim(),
      phone: formData.get("phone")?.trim(),
      email: formData.get("email")?.trim(),
      pet: formData.get("pet")?.trim(),
      message: formData.get("message")?.trim()
    };

    if (!payload.name || !payload.phone || !payload.message) {
      showMessage(
        status,
        "Please fill in your name, phone number and message.",
        "error"
      );
      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Sending...";
    }

    try {
      await apiRequest("/api/inquiries", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      form.reset();

      if (successBox) {
        successBox.classList.add("show");
        successBox.textContent =
          "Your inquiry has been received successfully. The owner can review it from the Owner Dashboard.";
      }

      if (status) {
        status.textContent = "";
        status.className = "message";
      }

    } catch (error) {
      console.error("Inquiry failed:", error);

      showMessage(
        status,
        error.message || "Your inquiry could not be sent. Please try again.",
        "error"
      );

    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Send Inquiry";
      }
    }
  });
}


/* =========================================================
   ORDER FORM
   ========================================================= */

function setupOrderForm() {
  const form = $("#orderForm");

  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = form.querySelector("button[type='submit']");
    const message = $("#orderMessage");

    const formData = new FormData(form);

    const payload = {
      name: formData.get("name")?.trim(),
      phone: formData.get("phone")?.trim(),
      email: formData.get("email")?.trim(),
      items: formData.get("items")?.trim(),
      address: formData.get("address")?.trim()
    };

    if (
      !payload.name ||
      !payload.phone ||
      !payload.items ||
      !payload.address
    ) {
      showMessage(
        message,
        "Please complete all required order fields.",
        "error"
      );

      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Placing Order...";
    }

    try {
      await apiRequest("/api/orders", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      form.reset();

      showMessage(
        message,
        "Your order has been received successfully. The owner can review it from the Owner Dashboard.",
        "success"
      );

    } catch (error) {
      console.error("Order failed:", error);

      showMessage(
        message,
        error.message || "Your order could not be submitted.",
        "error"
      );

    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Place Order";
      }
    }
  });
}


/* =========================================================
   MESSAGE HELPER
   ========================================================= */

function showMessage(element, text, type = "success") {
  if (!element) return;

  element.textContent = text;
  element.className = `message ${type}`;
}


/* =========================================================
   OWNER AUTHENTICATION
   ========================================================= */

async function checkOwnerStatus() {
  const setupArea = $("#ownerSetup");
  const loginArea = $("#ownerLogin");
  const dashboard = $("#ownerDashboard");
  const statusMessage = $("#ownerStatusMessage");

  try {
    const data = await apiRequest("/api/owner/status");

    if (data.ownerExists) {
      if (setupArea) {
        setupArea.classList.add("hidden");
      }

      if (loginArea) {
        loginArea.classList.remove("hidden");
      }

    } else {
      if (setupArea) {
        setupArea.classList.remove("hidden");
      }

      if (loginArea) {
        loginArea.classList.add("hidden");
      }

      if (dashboard) {
        dashboard.classList.remove("active");
      }
    }

    await checkOwnerSession();

  } catch (error) {
    console.error("Owner status check failed:", error);

    if (statusMessage) {
      showMessage(
        statusMessage,
        "The owner system is currently unavailable.",
        "error"
      );
    }
  }
}

async function checkOwnerSession() {
  try {
    const data = await apiRequest("/api/owner/me");

    if (data.authenticated) {
      showOwnerDashboard();
      await loadOwnerDashboard();
    } else {
      hideOwnerDashboard();
    }

  } catch {
    hideOwnerDashboard();
  }
}


/* =========================================================
   OWNER SETUP
   ========================================================= */

function setupOwnerSetupForm() {
  const form = $("#ownerSetupForm");

  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const password = $("#ownerPassword")?.value || "";
    const confirmPassword =
      $("#ownerConfirmPassword")?.value || "";

    const message = $("#ownerStatusMessage");

    if (password.length < 8) {
      showMessage(
        message,
        "Please choose a password with at least 8 characters.",
        "error"
      );

      return;
    }

    if (password !== confirmPassword) {
      showMessage(
        message,
        "The passwords do not match.",
        "error"
      );

      return;
    }

    try {
      await apiRequest("/api/owner/setup", {
        method: "POST",
        body: JSON.stringify({
          password
        })
      });

      form.reset();

      showMessage(
        message,
        "Owner account created successfully. You can now log in.",
        "success"
      );

      await checkOwnerStatus();

    } catch (error) {
      showMessage(
        message,
        error.message || "Owner setup failed.",
        "error"
      );
    }
  });
}


/* =========================================================
   OWNER LOGIN
   ========================================================= */

function setupOwnerLoginForm() {
  const form = $("#ownerLoginForm");

  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const password = $("#ownerLoginPassword")?.value || "";
    const message = $("#ownerStatusMessage");
    const submitButton = form.querySelector("button[type='submit']");

    if (!password) {
      showMessage(
        message,
        "Please enter your owner password.",
        "error"
      );

      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Logging in...";
    }

    try {
      await apiRequest("/api/owner/login", {
        method: "POST",
        body: JSON.stringify({
          password
        })
      });

      form.reset();

      showMessage(
        message,
        "Owner login successful.",
        "success"
      );

      showOwnerDashboard();

      await loadOwnerDashboard();

    } catch (error) {
      showMessage(
        message,
        error.message || "Invalid owner password.",
        "error"
      );

    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Owner Login";
      }
    }
  });
}


/* =========================================================
   OWNER DASHBOARD VISIBILITY
   ========================================================= */

function showOwnerDashboard() {
  const dashboard = $("#ownerDashboard");
  const loginArea = $("#ownerLogin");
  const setupArea = $("#ownerSetup");

  if (dashboard) {
    dashboard.classList.add("active");
  }

  if (loginArea) {
    loginArea.classList.add("hidden");
  }

  if (setupArea) {
    setupArea.classList.add("hidden");
  }
}

function hideOwnerDashboard() {
  const dashboard = $("#ownerDashboard");
  const loginArea = $("#ownerLogin");

  if (dashboard) {
    dashboard.classList.remove("active");
  }

  if (loginArea) {
    loginArea.classList.remove("hidden");
  }
}


/* =========================================================
   OWNER LOGOUT
   ========================================================= */

function setupOwnerLogout() {
  const button = $("#ownerLogout");

  if (!button) return;

  button.addEventListener("click", async () => {
    try {
      await apiRequest("/api/owner/logout", {
        method: "POST"
      });

      hideOwnerDashboard();

      const message = $("#ownerStatusMessage");

      showMessage(
        message,
        "You have been logged out successfully.",
        "success"
      );

      await checkOwnerStatus();

    } catch (error) {
      console.error("Logout failed:", error);

      alert("Logout failed. Please try again.");
    }
  });
}


/* =========================================================
   OWNER DASHBOARD DATA
   ========================================================= */

async function loadOwnerDashboard() {
  try {
    await Promise.all([
      loadOwnerPets(),
      loadOwnerInquiries(),
      loadOwnerOrders()
    ]);

  } catch (error) {
    console.error("Dashboard loading error:", error);
  }
}


/* =========================================================
   OWNER PETS
   ========================================================= */

async function loadOwnerPets() {
  const gallery = $("#ownerPetGallery");

  if (!gallery) return;

  try {
    const data = await apiRequest("/api/pets");

    const pets = Array.isArray(data)
      ? data
      : Array.isArray(data.pets)
        ? data.pets
        : [];

    if (pets.length === 0) {
      gallery.innerHTML = `
        <p class="empty-message">
          No pets have been added yet.
        </p>
      `;

      return;
    }

    gallery.innerHTML = pets.map((pet) => {
      const image =
        pet.image_url ||
        pet.imageUrl ||
        "https://placehold.co/800x500?text=Pet";

      return `
        <div class="owner-gallery-item">

          <img
            src="${escapeHTML(image)}"
            alt="${escapeHTML(pet.name)}"
          >

          <button
            type="button"
            class="delete-btn delete-pet-btn"
            data-id="${escapeHTML(pet.id)}"
          >
            Delete
          </button>

        </div>
      `;
    }).join("");

    $$(".delete-pet-btn").forEach((button) => {
      button.addEventListener("click", async () => {
        await deletePet(button.dataset.id);
      });
    });

  } catch (error) {
    console.error("Could not load owner pets:", error);

    gallery.innerHTML = `
      <p class="message error">
        Could not load your pet gallery.
      </p>
    `;
  }
}


/* =========================================================
   ADD PET
   ========================================================= */

function setupAddPetForm() {
  const form = $("#addPetForm");

  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = form.querySelector("button[type='submit']");

    const formData = new FormData(form);

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Uploading...";
    }

    try {
      await apiRequest("/api/pets", {
        method: "POST",
        body: formData
      });

      form.reset();

      alert("Pet added successfully.");

      await loadPets();
      await loadOwnerPets();

    } catch (error) {
      console.error("Add pet failed:", error);

      alert(
        error.message ||
        "The pet could not be added. Please try again."
      );

    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Add Pet";
      }
    }
  });
}


/* =========================================================
   DELETE PET
   ========================================================= */

async function deletePet(petId) {
  if (!petId) return;

  const confirmed = confirm(
    "Are you sure you want to delete this pet?"
  );

  if (!confirmed) return;

  try {
    await apiRequest(
      `/api/pets/${encodeURIComponent(petId)}`,
      {
        method: "DELETE"
      }
    );

    await loadPets();
    await loadOwnerPets();

  } catch (error) {
    console.error("Delete pet failed:", error);

    alert(
      error.message ||
      "The pet could not be deleted."
    );
  }
}


/* =========================================================
   OWNER INQUIRIES
   ========================================================= */

async function loadOwnerInquiries() {
  const container = $("#ownerInquiries");

  if (!container) return;

  try {
    const data = await apiRequest("/api/owner/inquiries");

    const inquiries = Array.isArray(data)
      ? data
      : Array.isArray(data.inquiries)
        ? data.inquiries
        : [];

    if (inquiries.length === 0) {
      container.innerHTML = `
        <p class="empty-message">
          No inquiries yet.
        </p>
      `;

      return;
    }

    container.innerHTML = inquiries.map((inquiry) => `
      <div class="owner-list-item">

        <strong>
          ${escapeHTML(inquiry.name)}
        </strong>

        <p>
          Pet:
          ${escapeHTML(inquiry.pet || "General inquiry")}
        </p>

        <p>
          Phone:
          ${escapeHTML(inquiry.phone)}
        </p>

        <p>
          Email:
          ${escapeHTML(inquiry.email || "Not provided")}
        </p>

        <p>
          ${escapeHTML(inquiry.message)}
        </p>

        <small>
          ${formatDate(inquiry.created_at)}
        </small>

      </div>
    `).join("");

  } catch (error) {
    console.error("Could not load inquiries:", error);

    container.innerHTML = `
      <p class="message error">
        Could not load inquiries.
      </p>
    `;
  }
}


/* =========================================================
   OWNER ORDERS
   ========================================================= */

async function loadOwnerOrders() {
  const container = $("#ownerOrders");

  if (!container) return;

  try {
    const data = await apiRequest("/api/owner/orders");

    const orders = Array.isArray(data)
      ? data
      : Array.isArray(data.orders)
        ? data.orders
        : [];

    if (orders.length === 0) {
      container.innerHTML = `
        <p class="empty-message">
          No orders yet.
        </p>
      `;

      return;
    }

    container.innerHTML = orders.map((order) => `
      <div class="owner-list-item">

        <strong>
          ${escapeHTML(order.name)}
        </strong>

        <p>
          Phone:
          ${escapeHTML(order.phone)}
        </p>

        <p>
          Email:
          ${escapeHTML(order.email || "Not provided")}
        </p>

        <p>
          Items:
          ${escapeHTML(order.items)}
        </p>

        <p>
          Address:
          ${escapeHTML(order.address)}
        </p>

        <p>
          Status:
          ${escapeHTML(order.status || "pending")}
        </p>

        <small>
          ${formatDate(order.created_at)}
        </small>

      </div>
    `).join("");

  } catch (error) {
    console.error("Could not load orders:", error);

    container.innerHTML = `
      <p class="message error">
        Could not load orders.
      </p>
    `;
  }
}


/* =========================================================
   CHANGE OWNER PASSWORD
   ========================================================= */

function setupChangePasswordForm() {
  const form = $("#changePasswordForm");

  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const currentPassword =
      $("#currentPassword")?.value || "";

    const newPassword =
      $("#newPassword")?.value || "";

    const confirmPassword =
      $("#confirmNewPassword")?.value || "";

    if (!currentPassword || !newPassword) {
      alert("Please complete all password fields.");

      return;
    }

    if (newPassword.length < 8) {
      alert(
        "Your new password must contain at least 8 characters."
      );

      return;
    }

    if (newPassword !== confirmPassword) {
      alert("The new passwords do not match.");

      return;
    }

    try {
      await apiRequest("/api/owner/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      });

      form.reset();

      alert(
        "Your owner password has been changed successfully."
      );

    } catch (error) {
      console.error("Password change failed:", error);

      alert(
        error.message ||
        "The password could not be changed."
      );
    }
  });
}


/* =========================================================
   CATEGORY BUTTONS
   ========================================================= */

function setupCategoryButtons() {
  $$(".category-card").forEach((card) => {
    card.addEventListener("click", () => {
      const category =
        card.dataset.category ||
        card.querySelector("h3")?.textContent ||
        "";

      const petGrid = $("#petGrid");

      if (petGrid) {
        petGrid.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }

      filterPetsByCategory(category);
    });
  });
}

function filterPetsByCategory(category) {
  const cards = $$(".pet-card");

  if (!cards.length) return;

  const normalizedCategory =
    category.toLowerCase().trim();

  cards.forEach((card) => {
    const text =
      card.textContent.toLowerCase();

    const matches =
      normalizedCategory.includes("other") ||
      normalizedCategory.includes("everything") ||
      text.includes(normalizedCategory);

    card.style.display = matches ? "" : "none";
  });
}


/* =========================================================
   PRODUCT CART — SIMPLE DEMO
   ========================================================= */

let cart = [];

function loadCart() {
  try {
    const saved = localStorage.getItem("petStoreCart");

    cart = saved ? JSON.parse(saved) : [];

    if (!Array.isArray(cart)) {
      cart = [];
    }

  } catch {
    cart = [];
  }
}

function saveCart() {
  try {
    localStorage.setItem(
      "petStoreCart",
      JSON.stringify(cart)
    );
  } catch {
    console.warn("Could not save cart.");
  }
}

function setupProductButtons() {
  $$(".add-to-cart").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".product-card");

      if (!card) return;

      const name =
        card.querySelector("h3")?.textContent?.trim() ||
        "Product";

      const price =
        card.querySelector(".product-price")?.textContent?.trim() ||
        "";

      cart.push({
        name,
        price
      });

      saveCart();

      button.textContent = "Added ✓";

      setTimeout(() => {
        button.textContent = "Add to Cart";
      }, 1500);
    });
  });
}


/* =========================================================
   IMAGE PREVIEW
   ========================================================= */

function setupImagePreview() {
  const input = $("#petImage");
  const form = $("#addPetForm");

  if (!input || !form) return;

  let preview = $("#petImagePreview");

  if (!preview) {
    preview = document.createElement("img");

    preview.id = "petImagePreview";

    preview.style.maxWidth = "100%";
    preview.style.maxHeight = "250px";
    preview.style.marginTop = "15px";
    preview.style.borderRadius = "10px";
    preview.style.display = "none";

    input.parentElement?.appendChild(preview);
  }

  input.addEventListener("change", () => {
    const file = input.files?.[0];

    if (!file) {
      preview.style.display = "none";
      preview.removeAttribute("src");
      return;
    }

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file.");

      input.value = "";

      preview.style.display = "none";

      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      preview.src = reader.result;
      preview.style.display = "block";
    };

    reader.readAsDataURL(file);
  });
}


/* =========================================================
   START EVERYTHING
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {

  setupNavigation();

  setupInquiryForm();

  setupOrderForm();

  setupOwnerSetupForm();

  setupOwnerLoginForm();

  setupOwnerLogout();

  setupAddPetForm();

  setupChangePasswordForm();

  setupCategoryButtons();

  setupProductButtons();

  setupImagePreview();

  loadCart();

  await loadPets();

  await checkOwnerStatus();

});


/* =========================================================
   SECURITY NOTE
   =========================================================

   No owner password is stored in this JavaScript.

   The password is sent to the backend over HTTPS and should
   be hashed and stored by the server.

   The backend must always enforce owner permissions.

   Never rely on hiding HTML elements or JavaScript alone
   to protect the Owner Dashboard.
   ========================================================= */
