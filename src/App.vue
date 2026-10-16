<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { clearTokens, getTokens, apiRequest, login, logout, register } from './api'
import { setTheme } from '@fluentui/web-components'
import { webDarkTheme, webLightTheme } from '@fluentui/tokens'

const user = ref(null)
const products = ref([])
const users = ref([])
const loading = ref(false)
const submitting = ref(false)
const authMode = ref('login')
const activePage = ref('products')
const query = ref('')
const notice = ref('')
const errorMessage = ref('')
const productDialog = ref(null)
const userDialog = ref(null)
const editingProduct = ref(false)
const editingUser = ref(false)
const darkMode = ref(false)

const credentials = reactive({ username: '', email: '', password: '' })
const productDraft = reactive({ id: null, product_name: '', description: '', price: '', quantity: '' })
const userDraft = reactive({ id: null, username: '', email: '', role: 'user', password: '' })

const isAdmin = computed(() => user.value?.role === 'admin')
const filteredProducts = computed(() => {
  const search = query.value.trim().toLowerCase()
  if (!search) return products.value
  return products.value.filter((product) =>
    [product.product_name, product.description].some((value) => String(value || '').toLowerCase().includes(search)),
  )
})
const filteredUsers = computed(() => {
  const search = query.value.trim().toLowerCase()
  if (!search) return users.value
  return users.value.filter((account) =>
    [account.username, account.email, account.role].some((value) => String(value || '').toLowerCase().includes(search)),
  )
})
const inventoryValue = computed(() => products.value.reduce((total, product) =>
  total + Number(product.price || 0) * Number(product.quantity || 0), 0))
const lowStockCount = computed(() => products.value.filter((product) => Number(product.quantity) <= 5).length)

function setThemeMode(isDark) {
  darkMode.value = isDark
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light'
  setTheme(isDark ? webDarkTheme : webLightTheme)
  localStorage.setItem('oracion-theme', isDark ? 'dark' : 'light')
}

function showError(error) {
  errorMessage.value = error instanceof Error ? error.message : 'Something went wrong. Please try again.'
  notice.value = ''
}

function showNotice(message) {
  notice.value = message
  errorMessage.value = ''
  window.setTimeout(() => {
    if (notice.value === message) notice.value = ''
  }, 3500)
}

async function loadProducts() {
  const result = await apiRequest('products')
  if (!Array.isArray(result)) {
    throw new Error('The API returned an unexpected products response.')
  }
  products.value = result
}

async function loadUsers() {
  const result = await apiRequest('users')
  if (!Array.isArray(result)) {
    throw new Error('The API returned an unexpected users response.')
  }
  users.value = result
}

async function loadPage() {
  loading.value = true
  errorMessage.value = ''
  try {
    if (activePage.value === 'users' && isAdmin.value) {
      await loadUsers()
    } else {
      activePage.value = 'products'
      await loadProducts()
    }
  } catch (error) {
    showError(error)
  } finally {
    loading.value = false
  }
}

async function finishSignIn() {
  const profile = await apiRequest('profile')
  if (!profile?.id || !['admin', 'user'].includes(profile.role)) {
    clearTokens()
    throw new Error('The API returned an invalid account profile.')
  }
  user.value = profile
  activePage.value = 'products'
  query.value = ''
  await loadPage()
}

async function submitAuth() {
  submitting.value = true
  errorMessage.value = ''
  try {
    if (authMode.value === 'register') {
      await register(credentials.username.trim(), credentials.email.trim(), credentials.password)
      authMode.value = 'login'
      credentials.password = ''
      showNotice('Account created. Sign in to continue.')
      return
    }

    await login(credentials.username.trim(), credentials.password)
    await finishSignIn()
  } catch (error) {
    showError(error)
  } finally {
    submitting.value = false
  }
}

async function signOut() {
  try {
    await logout()
  } catch {
    clearTokens()
  }
  user.value = null
  products.value = []
  users.value = []
  activePage.value = 'products'
  credentials.password = ''
}

function switchPage(page) {
  activePage.value = page
  query.value = ''
  loadPage()
}

function openProductDialog(product = null) {
  editingProduct.value = Boolean(product)
  Object.assign(productDraft, product
    ? {
        id: product.id,
        product_name: product.product_name || '',
        description: product.description || '',
        price: product.price ?? '',
        quantity: product.quantity ?? '',
      }
    : { id: null, product_name: '', description: '', price: '', quantity: '' })
  nextTick(() => productDialog.value?.showModal())
}

async function submitProduct() {
  submitting.value = true
  try {
    const body = {
      product_name: productDraft.product_name.trim(),
      description: productDraft.description.trim(),
      price: Number(productDraft.price),
      quantity: Number(productDraft.quantity),
    }
    await apiRequest(editingProduct.value ? `products/${productDraft.id}` : 'products', {
      method: editingProduct.value ? 'PUT' : 'POST',
      body,
    })
    productDialog.value?.close()
    await loadProducts()
    showNotice(editingProduct.value ? 'Product updated.' : 'Product added.')
  } catch (error) {
    showError(error)
  } finally {
    submitting.value = false
  }
}

async function removeProduct(product) {
  if (!window.confirm(`Delete “${product.product_name}”? This cannot be undone.`)) return
  try {
    await apiRequest(`products/${product.id}`, { method: 'DELETE' })
    await loadProducts()
    showNotice('Product deleted.')
  } catch (error) {
    showError(error)
  }
}

function openUserDialog(account = null) {
  editingUser.value = Boolean(account)
  Object.assign(userDraft, account
    ? { id: account.id, username: account.username, email: account.email, role: account.role, password: '' }
    : { id: null, username: '', email: '', role: 'user', password: '' })
  nextTick(() => userDialog.value?.showModal())
}

async function submitUser() {
  submitting.value = true
  try {
    const body = {
      username: userDraft.username.trim(),
      email: userDraft.email.trim(),
      role: userDraft.role,
      ...(editingUser.value ? {} : { password: userDraft.password }),
    }
    await apiRequest(editingUser.value ? `users/${userDraft.id}` : 'users', {
      method: editingUser.value ? 'PUT' : 'POST',
      body,
    })
    userDialog.value?.close()
    await loadUsers()
    showNotice(editingUser.value ? 'Account updated.' : 'Account created.')
  } catch (error) {
    showError(error)
  } finally {
    submitting.value = false
  }
}

async function removeUser(account) {
  if (Number(account.id) === Number(user.value?.id)) {
    showError(new Error('You cannot delete the account you are currently using.'))
    return
  }
  if (!window.confirm(`Delete the account for ${account.username}? This cannot be undone.`)) return
  try {
    await apiRequest(`users/${account.id}`, { method: 'DELETE' })
    await loadUsers()
    showNotice('Account deleted.')
  } catch (error) {
    showError(error)
  }
}

function formatDate(value) {
  if (!value) return 'Not available'
  const date = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

function money(value) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'PHP' }).format(Number(value || 0))
}

onMounted(async () => {
  const savedTheme = localStorage.getItem('oracion-theme')
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  setThemeMode(savedTheme ? savedTheme === 'dark' : prefersDark)
  if (!getTokens()) return

  loading.value = true
  try {
    await finishSignIn()
  } catch (error) {
    user.value = null
    showError(error)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main v-if="!user" class="auth-layout">
    <section class="auth-aside" aria-label="Inventory workspace">
      <a class="brand" href="/" aria-label="Oracion Inventory home">
        <span class="brand-mark">O</span>
        <span>Oracion<span class="brand-light"> / Inventory</span></span>
      </a>
      <div class="auth-copy">
        <p class="eyebrow">Inventory workspace</p>
        <h1>Know what you have.<br /><span>Move with clarity.</span></h1>
        <p>Keep products, quantities, and account access in one organized place.</p>
      </div>
      <div class="aside-foot">
        <span>Product inventory</span>
        <span>Account access</span>
      </div>
    </section>

    <section class="auth-panel">
      <div class="auth-form-wrap">
        <div class="mobile-brand">
          <span class="brand-mark">O</span>
          <span>Oracion<span class="brand-light"> / Inventory</span></span>
        </div>
        <p class="eyebrow">{{ authMode === 'login' ? 'Welcome back' : 'Create an account' }}</p>
        <h2>{{ authMode === 'login' ? 'Sign in to continue' : 'Join the workspace' }}</h2>
        <p class="form-intro">
          {{ authMode === 'login' ? 'Enter your account details to open your inventory.' : 'Create an account to get started. New accounts have standard access.' }}
        </p>

        <p v-if="notice" class="alert alert-success" role="status">{{ notice }}</p>
        <p v-if="errorMessage" class="alert alert-error" role="alert">{{ errorMessage }}</p>

        <form class="form-stack" @submit.prevent="submitAuth">
          <label class="field">
            <span>Username</span>
            <input v-model="credentials.username" autocomplete="username" maxlength="100" required />
          </label>
          <label v-if="authMode === 'register'" class="field">
            <span>Email address</span>
            <input v-model="credentials.email" type="email" autocomplete="email" maxlength="255" required />
          </label>
          <label class="field">
            <span>Password</span>
            <input
              v-model="credentials.password"
              type="password"
              :autocomplete="authMode === 'login' ? 'current-password' : 'new-password'"
              :minlength="authMode === 'register' ? 8 : undefined"
              required
            />
            <small v-if="authMode === 'register'">Use at least 8 characters.</small>
          </label>
          <fluent-button appearance="primary" type="submit" :disabled="submitting">
            {{ submitting ? 'Please wait…' : authMode === 'login' ? 'Sign in' : 'Create account' }}
          </fluent-button>
        </form>
        <p class="auth-switch">
          {{ authMode === 'login' ? 'New to the workspace?' : 'Already have an account?' }}
          <button type="button" @click="authMode = authMode === 'login' ? 'register' : 'login'; errorMessage = ''; notice = ''">
            {{ authMode === 'login' ? 'Create an account' : 'Sign in' }}
          </button>
        </p>
      </div>
      <button class="theme-control auth-theme" type="button" @click="setThemeMode(!darkMode)">
        {{ darkMode ? 'Light appearance' : 'Dark appearance' }}
      </button>
    </section>
  </main>

  <div v-else class="app-shell">
    <aside class="sidebar">
      <a class="brand" href="#" @click.prevent="switchPage('products')">
        <span class="brand-mark">O</span>
        <span>Oracion<span class="brand-light"> / Inventory</span></span>
      </a>

      <div class="workspace-label">WORKSPACE</div>
      <nav class="side-nav" aria-label="Main navigation">
        <button :class="{ active: activePage === 'products' }" @click="switchPage('products')">
          <span class="nav-glyph">P</span> Products
          <span class="nav-count">{{ products.length }}</span>
        </button>
        <button v-if="isAdmin" :class="{ active: activePage === 'users' }" @click="switchPage('users')">
          <span class="nav-glyph">U</span> Users
          <span class="nav-count">{{ users.length || '' }}</span>
        </button>
      </nav>

      <div class="sidebar-foot">
        <div class="user-summary">
          <span class="avatar">{{ user.username.slice(0, 1).toUpperCase() }}</span>
          <span class="user-summary-copy">
            <strong>{{ user.username }}</strong>
            <small>{{ isAdmin ? 'Administrator' : 'Standard access' }}</small>
          </span>
        </div>
        <fluent-button appearance="transparent" @click="signOut">Sign out</fluent-button>
      </div>
    </aside>

    <section class="main-column">
      <header class="topbar">
        <div class="breadcrumbs"><span>Workspace</span><span>/</span><strong>{{ activePage === 'users' ? 'Users' : 'Products' }}</strong></div>
        <div class="topbar-actions">
          <span class="role-label">{{ isAdmin ? 'Admin account' : 'Read-only account' }}</span>
          <button class="theme-control" type="button" @click="setThemeMode(!darkMode)">
            {{ darkMode ? 'Light mode' : 'Dark mode' }}
          </button>
        </div>
      </header>

      <main class="content">
        <div v-if="notice" class="alert alert-success page-alert" role="status">{{ notice }}</div>
        <div v-if="errorMessage" class="alert alert-error page-alert" role="alert">{{ errorMessage }}</div>

        <template v-if="activePage === 'products'">
          <div class="page-heading">
            <div>
              <p class="eyebrow">Inventory</p>
              <h1>Products</h1>
              <p class="page-subtitle">Review stock levels and keep your catalog current.</p>
            </div>
            <fluent-button v-if="isAdmin" appearance="primary" @click="openProductDialog()">Add product</fluent-button>
          </div>

          <section class="metrics" aria-label="Inventory summary">
            <article class="metric">
              <span class="metric-label">Products</span>
              <strong>{{ products.length }}</strong>
              <small>Items in the catalog</small>
            </article>
            <article class="metric">
              <span class="metric-label">Units in stock</span>
              <strong>{{ products.reduce((sum, item) => sum + Number(item.quantity || 0), 0).toLocaleString() }}</strong>
              <small>Across all products</small>
            </article>
            <article class="metric">
              <span class="metric-label">Inventory value</span>
              <strong>{{ money(inventoryValue) }}</strong>
              <small>{{ lowStockCount }} items at 5 units or fewer</small>
            </article>
          </section>

          <section class="data-panel">
            <div class="panel-heading">
              <div>
                <h2>Product catalog</h2>
                <p>{{ filteredProducts.length }} {{ filteredProducts.length === 1 ? 'product' : 'products' }}</p>
              </div>
              <label class="search-field">
                <span class="visually-hidden">Search products</span>
                <input v-model="query" type="search" placeholder="Search products" />
              </label>
            </div>

            <div v-if="loading" class="skeleton-list" aria-label="Loading products">
              <div v-for="row in 5" :key="row" class="skeleton-row"><span></span><span></span><span></span></div>
            </div>
            <div v-else-if="filteredProducts.length" class="table-scroll">
              <table>
                <thead>
                  <tr><th>Product</th><th>Price</th><th>In stock</th><th>Added</th><th v-if="isAdmin">Actions</th></tr>
                </thead>
                <tbody>
                  <tr v-for="product in filteredProducts" :key="product.id">
                    <td>
                      <strong>{{ product.product_name }}</strong>
                      <small class="cell-subtitle">{{ product.description || 'No description' }}</small>
                    </td>
                    <td>{{ money(product.price) }}</td>
                    <td><span class="stock-pill" :class="{ 'stock-low': Number(product.quantity) <= 5 }">{{ product.quantity }}</span></td>
                    <td>{{ formatDate(product.created_at) }}</td>
                    <td v-if="isAdmin" class="row-actions">
                      <button class="text-action" @click="openProductDialog(product)">Edit</button>
                      <button class="text-action danger-action" @click="removeProduct(product)">Delete</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="empty-state">
              <span class="empty-mark">P</span>
              <h3>{{ query ? 'No matching products' : 'Your catalog is empty' }}</h3>
              <p>{{ query ? 'Try another name or description.' : isAdmin ? 'Add a product to start tracking your inventory.' : 'Products will appear here when they are added.' }}</p>
              <fluent-button v-if="!query && isAdmin" appearance="primary" @click="openProductDialog()">Add your first product</fluent-button>
            </div>
          </section>
        </template>

        <template v-else>
          <div class="page-heading">
            <div>
              <p class="eyebrow">Access control</p>
              <h1>Users</h1>
              <p class="page-subtitle">Manage accounts and the roles attached to them.</p>
            </div>
            <fluent-button appearance="primary" @click="openUserDialog()">Add user</fluent-button>
          </div>

          <section class="data-panel">
            <div class="panel-heading">
              <div><h2>Workspace accounts</h2><p>{{ filteredUsers.length }} {{ filteredUsers.length === 1 ? 'account' : 'accounts' }}</p></div>
              <label class="search-field">
                <span class="visually-hidden">Search accounts</span>
                <input v-model="query" type="search" placeholder="Search accounts" />
              </label>
            </div>
            <div v-if="loading" class="skeleton-list" aria-label="Loading accounts">
              <div v-for="row in 4" :key="row" class="skeleton-row"><span></span><span></span><span></span></div>
            </div>
            <div v-else-if="filteredUsers.length" class="table-scroll">
              <table>
                <thead><tr><th>Account</th><th>Role</th><th>Joined</th><th>Actions</th></tr></thead>
                <tbody>
                  <tr v-for="account in filteredUsers" :key="account.id">
                    <td><strong>{{ account.username }}</strong><small class="cell-subtitle">{{ account.email }}</small></td>
                    <td><span class="role-pill" :class="{ 'role-admin': account.role === 'admin' }">{{ account.role }}</span></td>
                    <td>{{ formatDate(account.created_at) }}</td>
                    <td class="row-actions">
                      <button class="text-action" @click="openUserDialog(account)">Edit</button>
                      <button class="text-action danger-action" :disabled="Number(account.id) === Number(user.id)" @click="removeUser(account)">Delete</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="empty-state">
              <span class="empty-mark">U</span>
              <h3>{{ query ? 'No matching accounts' : 'No accounts found' }}</h3>
              <p>{{ query ? 'Try another username, email, or role.' : 'Create an account to grant workspace access.' }}</p>
              <fluent-button v-if="!query" appearance="primary" @click="openUserDialog()">Add user</fluent-button>
            </div>
          </section>
        </template>
      </main>
    </section>
  </div>

  <dialog ref="productDialog" class="modal" @close="errorMessage = ''">
    <form class="modal-form" @submit.prevent="submitProduct">
      <div class="modal-heading">
        <div><p class="eyebrow">{{ editingProduct ? 'Catalog update' : 'New catalog item' }}</p><h2>{{ editingProduct ? 'Edit product' : 'Add product' }}</h2></div>
        <button class="modal-close" type="button" aria-label="Close dialog" @click="productDialog?.close()">×</button>
      </div>
      <p v-if="errorMessage" class="alert alert-error" role="alert">{{ errorMessage }}</p>
      <label class="field"><span>Product name</span><input v-model="productDraft.product_name" maxlength="100" required /></label>
      <label class="field"><span>Description</span><textarea v-model="productDraft.description" maxlength="255" rows="3"></textarea><small>Up to 255 characters.</small></label>
      <div class="form-pair">
        <label class="field"><span>Price (PHP)</span><input v-model="productDraft.price" type="number" min="0" max="99999999.99" step="0.01" required /></label>
        <label class="field"><span>Quantity</span><input v-model="productDraft.quantity" type="number" min="0" step="1" required /></label>
      </div>
      <div class="modal-actions">
        <fluent-button appearance="transparent" type="button" @click="productDialog?.close()">Cancel</fluent-button>
        <fluent-button appearance="primary" type="submit" :disabled="submitting">{{ submitting ? 'Saving…' : editingProduct ? 'Save changes' : 'Add product' }}</fluent-button>
      </div>
    </form>
  </dialog>

  <dialog ref="userDialog" class="modal" @close="errorMessage = ''">
    <form class="modal-form" @submit.prevent="submitUser">
      <div class="modal-heading">
        <div><p class="eyebrow">Access control</p><h2>{{ editingUser ? 'Edit account' : 'Add user' }}</h2></div>
        <button class="modal-close" type="button" aria-label="Close dialog" @click="userDialog?.close()">×</button>
      </div>
      <p v-if="errorMessage" class="alert alert-error" role="alert">{{ errorMessage }}</p>
      <label class="field"><span>Username</span><input v-model="userDraft.username" maxlength="100" autocomplete="username" required /></label>
      <label class="field"><span>Email address</span><input v-model="userDraft.email" type="email" maxlength="255" autocomplete="email" required /></label>
      <label v-if="!editingUser" class="field"><span>Temporary password</span><input v-model="userDraft.password" type="password" minlength="8" autocomplete="new-password" required /><small>At least 8 characters.</small></label>
      <label class="field"><span>Role</span>
        <select v-model="userDraft.role" :disabled="editingUser && Number(userDraft.id) === Number(user.id)" required>
          <option value="user">User</option><option value="admin">Admin</option>
        </select>
      </label>
      <div class="modal-actions">
        <fluent-button appearance="transparent" type="button" @click="userDialog?.close()">Cancel</fluent-button>
        <fluent-button appearance="primary" type="submit" :disabled="submitting">{{ submitting ? 'Saving…' : editingUser ? 'Save changes' : 'Create user' }}</fluent-button>
      </div>
    </form>
  </dialog>
</template>
