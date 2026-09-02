"use strict";

/*
  PET STORE FRONTEND
  ------------------
  This file connects the HTML website to the Pet Store backend.

  IMPORTANT:
  The owner's password is NEVER stored here.
  Authentication is handled by the backend.
*/

// --------------------------------------------------
// Backend URL
// --------------------------------------------------

// Leave empty while testing the frontend and backend
// on the same server.
//
// When the backend is deployed separately, set:
// window.PET_STORE_API_URL = "https://YOUR-BACKEND-URL";

const API_BASE =
  window.PET_STORE_API_URL || "";

// --------------------------------------------------
// Helpers
// --------------------------------------------------

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showMessage(element, message, type = "info") {
  if (!element) return;

  element.textContent = message;
  element.className = `message ${type}`;
  element.hidden = false;
}

function hideMessage(element) {
  if (!element) return;

  element.hidden = true;
  element.textContent = "";
}

async function apiRequest(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    credentials: "include",
    ...options
  });

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data.error || "Something went wrong. Please try again."
    );
  }

  return data;
}

// --------------------------------------------------
// Navigation
// --------------------------------------------------

function setupNavigation() {
  const navLinks = document.querySelectorAll(
    ".nav-links a[href^='#']"
  );

  navLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const targetId = link.getAttribute("href");

      if (!targetId || targetId === "#") return;

      const target = document.querySelector(targetId);

      if (!target) return;

      event.preventDefault();

      target.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

      history.replaceState(null, "", targetId);
    });
  });
}

// --------------------------------------------------
// Pet loading
// --------------------------------------------------

async function loadPets() {
  const petGrid = document.querySelector("#petGrid");
  const loading = document.querySelector("#petsLoading");
  const empty = document.querySelector("#petsEmpty");

  if (!petGrid) return;

  if (loading) loading.hidden = false;
  if (empty) empty.hidden = true;

  try {
    const data = await apiRequest("/api/pets");

    const pets = Array.isArray(data.pets)
      ? data.pets
      : [];

    petGrid.innerHTML = "";

    if (pets.length === 0) {
      if (empty) empty.hidden = false;
      return;
    }

    pets.forEach((pet) => {
      petGrid.appendChild(createPetCard(pet));
    });

    setupPetInteractions();
  } catch (error) {
    console.error("Unable to load pets:", error);

    petGrid.innerHTML = `
      <p class="error-message">
        Unable to load pets right now. Please try again later.
      </p>
    `;
  } finally {
    if (loading) loading.hidden = true;
  }
}

function createPetCard(pet) {
  const card = document.createElement("article");

  card.className = "pet-card";

  const image = pet.image_url
    ? escapeHTML(apiUrl(pet.image_url))
    : "";

  const price = Number(pet.price);

  const formattedPrice = Number.isFinite(price)
    ? `₦${price.toLocaleString("en-NG", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}`
    : "Price available on inquiry";

  card.innerHTML = `
    <button
      type="button"
      class="pet-image-button"
      data-pet-name="${escapeHTML(pet.name)}"
      aria-label="Inquire about ${escapeHTML(pet.name)}"
    >
      ${
        image
          ? `
            <img
              src="${image}"
              alt="${escapeHTML(pet.name)}"
              loading="lazy"
            >
          `
          : `
            <div class="pet-image-placeholder">
              🐾
            </div>
          `
      }
    </button>

    <div class="pet-card-content">
      <span class="pet-category">
        ${escapeHTML(pet.category)}
      </span>

      <h3>${escapeHTML(pet.name)}</h3>

      <p>
        ${escapeHTML(pet.description)}
      </p>

      <strong class="pet-price">
        ${formattedPrice}
      </strong>

      <div class="pet-actions">
        <button
          type="button"
          class="inquire-pet"
          data-pet-name="${escapeHTML(pet.name)}"
        >
          Inquire
        </button>

        <button
          type="button"
          class="like-pet"
          data-pet-id="${escapeHTML(pet.id)}"
        >
          ❤️ ${Number(pet.likes) || 0}
        </button>
      </div>
    </div>
  `;

  return card;
}

// --------------------------------------------------
// Pet interactions
// --------------------------------------------------

function setupPetInteractions() {
  document
    .querySelectorAll(".inquire-pet, .pet-image-button")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const petName =
          button.dataset.petName || "";

        openInquiryForPet(petName);
      });
    });

  document
    .querySelectorAll(".like-pet")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        const petId = button.dataset.petId;

        if (!petId) return;

        button.disabled = true;

        try {
          const data = await apiRequest(
            `/api/pets/${encodeURIComponent(petId)}/like`,
            {
              method: "POST"
            }
          );

          button.textContent =
            `❤️ ${Number(data.likes) || 0}`;
        } catch (error) {
          console.error("Like error:", error);
        } finally {
          button.disabled = false;
        }
      });
    });
}

// --------------------------------------------------
// Inquiry
// --------------------------------------------------

function openInquiryForPet(petName) {
  const form = document.querySelector("#inquiryForm");

  if (!form) return;

  const petInput =
    form.querySelector('[name="pet"]');

  if (petInput) {
    petInput.value = petName;
  }

  const inquirySection =
    document.querySelector("#inquiry");

  if (inquirySection) {
    inquirySection.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  const nameInput =
    document.querySelector("#inquiryName");

  if (nameInput) {
    setTimeout(() => nameInput.focus(), 400);
  }
}

function setupInquiryForm() {
  const form = document.querySelector("#inquiryForm");
  const success = document.querySelector("#inquirySuccess");
  const status = document.querySelector(
    "#inquiryMessageStatus"
  );

  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    hideMessage(success);
    hideMessage(status);

    const submitButton =
      form.querySelector('button[type="submit"]');

    if (submitButton) {
      submitButton.disabled = true;
    }

    const formData = new FormData(form);

    const payload = {
      name: String(formData.get("name") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      pet: String(formData.get("pet") || "").trim(),
      message: String(formData.get("message") || "").trim()
    };

    try {
      const data = await apiRequest(
        "/api/inquiries",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        }
      );

      form.reset();

      showMessage(
        success,
        data.message ||
          "Your inquiry has been received.",
        "success"
      );

      if (success) {
        success.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
      }
    } catch (error) {
      showMessage(
        status,
        error.message ||
          "Unable to send your inquiry.",
        "error"
      );
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });
}

// --------------------------------------------------
// Orders
// --------------------------------------------------

function getCart() {
  try {
    const cart = JSON.parse(
      localStorage.getItem("petStoreCart") || "[]"
    );

    return Array.isArray(cart) ? cart : [];
  } catch {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(
    "petStoreCart",
    JSON.stringify(cart)
  );
}

function setupCart() {
  const buttons =
    document.querySelectorAll(".add-to-cart");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const item = {
        name:
          button.dataset.name ||
          button.closest(".product-card")
            ?.querySelector("h3")
            ?.textContent ||
          "Pet Store item",

        price:
          button.dataset.price || ""
      };

      const cart = getCart();

      cart.push(item);

      saveCart(cart);

      button.textContent = "Added ✓";

      setTimeout(() => {
        button.textContent = "Add to Cart";
      }, 1500);

      updateCartDisplay();
    });
  });

  updateCartDisplay();
}

function updateCartDisplay() {
  const cart = getCart();

  const cartCount =
    document.querySelector("#cartCount");

  if (cartCount) {
    cartCount.textContent = String(cart.length);
  }

  const cartItems =
    document.querySelector("#cartItems");

  if (cartItems) {
    cartItems.innerHTML = cart.length
      ? cart
          .map(
            (item) => `
              <li>
                ${escapeHTML(item.name)}
              </li>
            `
          )
          .join("")
      : "<li>Your cart is empty.</li>";
  }
}

function setupOrderForm() {
  const form = document.querySelector("#orderForm");
  const message = document.querySelector("#orderMessage");

  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    hideMessage(message);

    const submitButton =
      form.querySelector('button[type="submit"]');

    if (submitButton) {
      submitButton.disabled = true;
    }

    const formData = new FormData(form);

    const cart = getCart();

    const itemsFromCart = cart
      .map((item) => item.name)
      .join(", ");

    const manualItems =
      String(formData.get("items") || "").trim();

    const items =
      manualItems || itemsFromCart;

    if (!items) {
      showMessage(
        message,
        "Please select or enter an item before ordering.",
        "error"
      );

      if (submitButton) {
        submitButton.disabled = false;
      }

      return;
    }

    const payload = {
      name: String(formData.get("name") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      items,
      address: String(
        formData.get("address") || ""
      ).trim()
    };

    try {
      const data = await apiRequest(
        "/api/orders",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        }
      );

      showMessage(
        message,
        data.message ||
          "Your order has been received.",
        "success"
      );

      form.reset();

      saveCart([]);
      updateCartDisplay();
    } catch (error) {
      showMessage(
        message,
        error.message ||
          "Unable to submit your order.",
        "error"
      );
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });
}

// --------------------------------------------------
// Categories
// --------------------------------------------------

function setupCategories() {
  document
    .querySelectorAll(".category-card")
    .forEach((card) => {
      card.addEventListener("click", () => {
        const category =
          card.dataset.category ||
          card.querySelector("h3")
            ?.textContent
            ?.trim();

        if (!category) return;

        const cards =
          document.querySelectorAll(".pet-card");

        let found = false;

        cards.forEach((petCard) => {
          const petCategory =
            petCard
              .querySelector(".pet-category")
              ?.textContent
              ?.trim()
              ?.toLowerCase();

          const wanted =
            category.toLowerCase();

          const show =
            wanted === "everything" ||
            wanted === "other pets" ||
            petCategory === wanted;

          petCard.hidden = !show;

          if (show) found = true;
        });

        if (found) {
          document
            .querySelector("#pets")
            ?.scrollIntoView({
              behavior: "smooth"
            });
        }
      });
    });
}

// --------------------------------------------------
// Owner setup
// --------------------------------------------------

async function checkOwnerStatus() {
  const setupSection =
    document.querySelector("#ownerSetup");

  const loginSection =
    document.querySelector("#ownerLogin");

  if (!setupSection && !loginSection) return;

  try {
    const data = await apiRequest(
      "/api/owner/status"
    );

    if (data.setupRequired) {
      if (setupSection) {
        setupSection.hidden = false;
      }

      if (loginSection) {
        loginSection.hidden = true;
      }
    } else {
      if (setupSection) {
        setupSection.hidden = true;
      }

      if (loginSection) {
        loginSection.hidden = false;
      }
    }
  } catch (error) {
    console.error(
      "Owner status error:",
      error
    );
  }
}

function setupOwnerSetupForm() {
  const form =
    document.querySelector("#ownerSetupForm");

  const password =
    document.querySelector("#ownerPassword");

  const confirmPassword =
    document.querySelector("#ownerConfirmPassword");

  const message =
    document.querySelector("#ownerStatusMessage");

  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    hideMessage(message);

    if (!password || !confirmPassword) return;

    if (password.value !== confirmPassword.value) {
      showMessage(
        message,
        "The passwords do not match.",
        "error"
      );

      return;
    }

    if (password.value.length < 8) {
      showMessage(
        message,
        "Password must be at least 8 characters.",
        "error"
      );

      return;
    }

    try {
      const data = await apiRequest(
        "/api/owner/setup",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            password: password.value
          })
        }
      );

      // Clear password fields immediately.
      password.value = "";
      confirmPassword.value = "";

      showMessage(
        message,
        data.message ||
          "Owner account created successfully.",
        "success"
      );

      form.reset();

      setTimeout(() => {
        showOwnerDashboard();
      }, 500);
    } catch (error) {
      showMessage(
        message,
        error.message ||
          "Unable to create owner account.",
        "error"
      );
    }
  });
}

// --------------------------------------------------
// Owner login
// --------------------------------------------------

function setupOwnerLoginForm() {
  const form =
    document.querySelector("#ownerLoginForm");

  const password =
    document.querySelector("#ownerLoginPassword");

  const message =
    document.querySelector("#ownerStatusMessage");

  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    hideMessage(message);

    if (!password) return;

    try {
      const data = await apiRequest(
        "/api/owner/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            password: password.value
          })
        }
      );

      password.value = "";

      showMessage(
        message,
        data.message ||
          "Owner login successful.",
        "success"
      );

      await showOwnerDashboard();
    } catch (error) {
      password.value = "";

      showMessage(
        message,
        error.message ||
          "Unable to log in.",
        "error"
      );
    }
  });
}

// --------------------------------------------------
// Owner dashboard
// --------------------------------------------------

async function showOwnerDashboard() {
  try {
    await apiRequest("/api/owner/me");

    const dashboard =
      document.querySelector("#ownerDashboard");

    const login =
      document.querySelector("#ownerLogin");

    const setup =
      document.querySelector("#ownerSetup");

    if (dashboard) dashboard.hidden = false;
    if (login) login.hidden = true;
    if (setup) setup.hidden = true;

    await loadOwnerPets();
    await loadOwnerInquiries();
    await loadOwnerOrders();
  } catch {
    const dashboard =
      document.querySelector("#ownerDashboard");

    if (dashboard) {
      dashboard.hidden = true;
    }
  }
}

async function checkExistingOwnerSession() {
  try {
    await apiRequest("/api/owner/me");

    await showOwnerDashboard();
  } catch {
    await checkOwnerStatus();
  }
}

// --------------------------------------------------
// Owner pets
// --------------------------------------------------

async function loadOwnerPets() {
  const gallery =
    document.querySelector("#ownerPetGallery");

  if (!gallery) return;

  try {
    const data = await apiRequest("/api/pets");

    const pets = Array.isArray(data.pets)
      ? data.pets
      : [];

    gallery.innerHTML = pets.length
      ? pets
          .map(
            (pet) => `
              <article class="owner-pet">
                ${
                  pet.image_url
                    ? `
                      <img
                        src="${escapeHTML(
                          apiUrl(pet.image_url)
                        )}"
                        alt="${escapeHTML(
                          pet.name
                        )}"
                        loading="lazy"
                      >
                    `
                    : `
                      <div class="pet-image-placeholder">
                        🐾
                      </div>
                    `
                }

                <h4>
                  ${escapeHTML(pet.name)}
                </h4>

                <p>
                  ${escapeHTML(pet.description)}
                </p>

                <button
                  type="button"
                  class="delete-pet"
                  data-pet-id="${escapeHTML(
                    pet.id
                  )}"
                >
                  Delete
                </button>
              </article>
            `
          )
          .join("")
      : "<p>No pets have been added yet.</p>";

    gallery
      .querySelectorAll(".delete-pet")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => deletePet(button.dataset.petId)
        );
      });
  } catch (error) {
    gallery.innerHTML = `
      <p class="error-message">
        ${escapeHTML(error.message)}
      </p>
    `;
  }
}

async function deletePet(petId) {
  if (!petId) return;

  const confirmed = window.confirm(
    "Delete this pet from the store?"
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
    window.alert(
      error.message ||
        "Unable to delete pet."
    );
  }
}

// --------------------------------------------------
// Add pet
// --------------------------------------------------

function setupAddPetForm() {
  const form =
    document.querySelector("#addPetForm");

  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton =
      form.querySelector('button[type="submit"]');

    if (submitButton) {
      submitButton.disabled = true;
    }

    try {
      const formData = new FormData(form);

      await apiRequest("/api/pets", {
        method: "POST",
        body: formData
      });

      form.reset();

      await loadPets();
      await loadOwnerPets();

      window.alert(
        "Pet added successfully."
      );
    } catch (error) {
      window.alert(
        error.message ||
          "Unable to add pet."
      );
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });
}

// --------------------------------------------------
// Owner inquiries
// --------------------------------------------------

async function loadOwnerInquiries() {
  const container =
    document.querySelector("#ownerInquiries");

  if (!container) return;

  try {
    const data = await apiRequest(
      "/api/owner/inquiries"
    );

    const inquiries = Array.isArray(
      data.inquiries
    )
      ? data.inquiries
      : [];

    container.innerHTML = inquiries.length
      ? inquiries
          .map(
            (item) => `
              <article class="owner-inquiry">
                <h4>
                  ${escapeHTML(item.name)}
                </h4>

                <p>
                  <strong>Pet:</strong>
                  ${escapeHTML(item.pet)}
                </p>

                <p>
                  <strong>Phone:</strong>
                  ${escapeHTML(item.phone)}
                </p>

                ${
                  item.email
                    ? `
                      <p>
                        <strong>Email:</strong>
                        ${escapeHTML(
                          item.email
                        )}
                      </p>
                    `
                    : ""
                }

                <p>
                  ${escapeHTML(item.message)}
                </p>
              </article>
            `
          )
          .join("")
      : "<p>No inquiries yet.</p>";
  } catch (error) {
    container.innerHTML = `
      <p class="error-message">
        ${escapeHTML(error.message)}
      </p>
    `;
  }
}

// --------------------------------------------------
// Owner orders
// --------------------------------------------------

async function loadOwnerOrders() {
  const container =
    document.querySelector("#ownerOrders");

  if (!container) return;

  try {
    const data = await apiRequest(
      "/api/owner/orders"
    );

    const orders = Array.isArray(data.orders)
      ? data.orders
      : [];

    container.innerHTML = orders.length
      ? orders
          .map(
            (order) => `
              <article class="owner-order">
                <h4>
                  ${escapeHTML(order.name)}
                </h4>

                <p>
                  <strong>Phone:</strong>
                  ${escapeHTML(order.phone)}
                </p>

                <p>
                  <strong>Items:</strong>
                  ${escapeHTML(order.items)}
                </p>

                <p>
                  <strong>Address:</strong>
                  ${escapeHTML(order.address)}
                </p>

                <p>
                  <strong>Status:</strong>
                  ${escapeHTML(order.status)}
                </p>
              </article>
            `
          )
          .join("")
      : "<p>No orders yet.</p>";
  } catch (error) {
    container.innerHTML = `
      <p class="error-message">
        ${escapeHTML(error.message)}
      </p>
    `;
  }
}

// --------------------------------------------------
// Logout
// --------------------------------------------------

function setupOwnerLogout() {
  const button =
    document.querySelector("#ownerLogout");

  if (!button) return;

  button.addEventListener("click", async () => {
    try {
      await apiRequest(
        "/api/owner/logout",
        {
          method: "POST"
        }
      );
    } catch (error) {
      console.error("Logout error:", error);
    }

    const dashboard =
      document.querySelector("#ownerDashboard");

    if (dashboard) {
      dashboard.hidden = true;
    }

    await checkOwnerStatus();
  });
}

// --------------------------------------------------
// Change password
// --------------------------------------------------

function setupChangePasswordForm() {
  const form =
    document.querySelector("#changePasswordForm");

  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const currentPassword =
      document.querySelector("#currentPassword");

    const newPassword =
      document.querySelector("#newPassword");

    const confirmPassword =
      document.querySelector("#confirmNewPassword");

    if (
      !currentPassword ||
      !newPassword ||
      !confirmPassword
    ) {
      return;
    }

    if (
      newPassword.value !==
      confirmPassword.value
    ) {
      window.alert(
        "The new passwords do not match."
      );

      return;
    }

    try {
      await apiRequest(
        "/api/owner/change-password",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            currentPassword:
              currentPassword.value,

            newPassword:
              newPassword.value
          })
        }
      );

      form.reset();

      window.alert(
        "Password changed successfully."
      );
    } catch (error) {
      window.alert(
        error.message ||
          "Unable to change password."
      );
    }
  });
}

// --------------------------------------------------
// Start everything
// --------------------------------------------------

document.addEventListener(
  "DOMContentLoaded",
  async () => {
    setupNavigation();
    setupInquiryForm();
    setupOrderForm();
    setupCart();
    setupCategories();

    setupOwnerSetupForm();
    setupOwnerLoginForm();
    setupAddPetForm();
    setupOwnerLogout();
    setupChangePasswordForm();

    await loadPets();

    await checkExistingOwnerSession();
  }
);
