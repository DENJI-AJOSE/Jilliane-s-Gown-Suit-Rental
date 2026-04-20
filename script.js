// ===============================
// GOWN DISPLAY SYSTEM (GLOBAL)
// ===============================
const categoryCatalog = window.GOWN_CATALOG || { order: [], categories: {} };
const maxItems = Object.fromEntries(
    Object.entries(categoryCatalog.categories).map(([slug, details]) => [slug, details.files.length])
);

let grid = null;
let backButtonContainer = null;
let paginationContainer = null;
let currentCategory = null;
let currentPage = 1;
const itemsPerPage = 12;
const dbConfig = window.DB_CONFIG || {};
const rentalsApiBase = dbConfig.supabaseUrl
    ? `${dbConfig.supabaseUrl.replace(/\/$/, '')}/rest/v1/rentals`
    : '';

function getTodayLocalDate() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().split('T')[0];
}

function getCategoryDetails(category) {
    return categoryCatalog.categories[category] || null;
}

function getCategoryFiles(category) {
    const details = getCategoryDetails(category);
    return details ? details.files : [];
}

function getImageSrc(category, fileName) {
    const details = getCategoryDetails(category);
    if (!details || !fileName) return '';
    return `${details.folder}/${fileName}`;
}

function getDisplayLabel(fileName) {
    return fileName.replace(/\.[^.]+$/, '');
}

function getItemLabel(category, itemId) {
    const files = getCategoryFiles(category);
    const fileName = files[Number(itemId) - 1];
    return fileName ? getDisplayLabel(fileName) : `${getCategoryDetails(category)?.name || category} #${itemId}`;
}

function getItemIdFromFileName(category, fileName) {
    const files = getCategoryFiles(category);
    const index = files.indexOf(fileName);
    return index >= 0 ? index + 1 : null;
}

function populateRentalItems(category, selectedFile = '') {
    const itemSelect = document.getElementById('rental-item');
    if (!itemSelect) return;

    itemSelect.innerHTML = '';

    if (!category) {
        itemSelect.disabled = true;
        itemSelect.innerHTML = '<option value="">Select category first</option>';
        return;
    }

    const files = getCategoryFiles(category);
    itemSelect.disabled = files.length === 0;

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = files.length ? 'Select gown code' : 'No items available';
    itemSelect.appendChild(placeholder);

    files.forEach(fileName => {
        const option = document.createElement('option');
        option.value = fileName;
        option.textContent = getDisplayLabel(fileName);
        option.selected = fileName === selectedFile;
        itemSelect.appendChild(option);
    });
}

// ===============================
// ADMIN AUTHENTICATION SYSTEM
// ===============================
const ADMIN_CREDENTIALS = {
    username: 'JillianesAdmin123',
    password: 'Admin123'
};

let isAdminAuthenticated = false;

function hasDatabaseConfig() {
    return Boolean(dbConfig.supabaseUrl && dbConfig.supabaseAnonKey);
}

function getDatabaseHeaders(prefer = '') {
    const headers = {
        apikey: dbConfig.supabaseAnonKey,
        'Content-Type': 'application/json'
    };

    // Supabase publishable keys (sb_publishable_...) are not JWT bearer tokens.
    // Only attach Authorization when the key looks like a legacy JWT anon key.
    if (typeof dbConfig.supabaseAnonKey === 'string' && dbConfig.supabaseAnonKey.startsWith('ey')) {
        headers.Authorization = `Bearer ${dbConfig.supabaseAnonKey}`;
    }

    if (prefer) {
        headers.Prefer = prefer;
    }

    return headers;
}

function normalizeDatabaseRows(rows) {
    const nextRentals = {};

    rows.forEach(row => {
        const key = getRentalKey(row.category, row.item_id);
        if (!nextRentals[key]) {
            nextRentals[key] = [];
        }

        nextRentals[key].push({
            id: row.id,
            outDate: row.out_date,
            returnDate: row.return_date,
            rentedOn: row.rented_on
        });
    });

    return nextRentals;
}

function isUuid(value) {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function fetchAllRentalsFromDatabase() {
    if (!hasDatabaseConfig()) {
        rentals = {};
        return;
    }

    const response = await fetch(`${rentalsApiBase}?select=*&order=category.asc,item_id.asc,out_date.asc`, {
        headers: getDatabaseHeaders()
    });

    if (!response.ok) {
        throw new Error(`Failed to load rentals (${response.status})`);
    }

    const rows = await response.json();
    rentals = normalizeDatabaseRows(rows);
    checkRentalExpiry();
}

async function insertRentalIntoDatabase(reservation) {
    const response = await fetch(rentalsApiBase, {
        method: 'POST',
        headers: getDatabaseHeaders('return=representation'),
        body: JSON.stringify([{
            id: reservation.id,
            category: reservation.category,
            item_id: reservation.itemId,
            out_date: reservation.outDate,
            return_date: reservation.returnDate,
            rented_on: reservation.rentedOn
        }])
    });

    if (!response.ok) {
        throw new Error(`Failed to save rental (${response.status})`);
    }
}

async function deleteRentalFromDatabase(reservationId) {
    const response = await fetch(`${rentalsApiBase}?id=eq.${encodeURIComponent(reservationId)}`, {
        method: 'DELETE',
        headers: getDatabaseHeaders()
    });

    if (!response.ok) {
        throw new Error(`Failed to delete rental (${response.status})`);
    }
}

async function syncExpiredRentalsWithDatabase(expiredReservationIds) {
    if (!hasDatabaseConfig() || !expiredReservationIds.length) return;

    await Promise.all(expiredReservationIds.map(id => deleteRentalFromDatabase(id)));
}

async function migrateLocalStorageToDatabase() {
    if (!hasDatabaseConfig()) return;

    const saved = localStorage.getItem('gownRentals');
    if (!saved) return;

    let parsed;
    try {
        parsed = JSON.parse(saved);
    } catch (error) {
        console.error('Unable to parse local rental data for migration.', error);
        return;
    }

    const rows = [];
    Object.entries(parsed).forEach(([key, value]) => {
        const { category, itemId } = parseRentalKey(key);
        const entries = Array.isArray(value) ? value : [value];

        entries.forEach(entry => {
            rows.push({
                id: isUuid(entry.id) ? entry.id : crypto.randomUUID(),
                category,
                item_id: Number(itemId),
                out_date: entry.outDate,
                return_date: entry.returnDate,
                rented_on: entry.rentedOn || getTodayLocalDate()
            });
        });
    });

    if (!rows.length) {
        localStorage.removeItem('gownRentals');
        return;
    }

    const response = await fetch(rentalsApiBase, {
        method: 'POST',
        headers: getDatabaseHeaders('resolution=merge-duplicates,return=minimal'),
        body: JSON.stringify(rows)
    });

    if (!response.ok) {
        throw new Error(`Failed to migrate rentals (${response.status})`);
    }

    localStorage.removeItem('gownRentals');
}

function handleAdminLogin(event) {
    event.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
        isAdminAuthenticated = true;
        closeLoginModal();
        showAdminPanel();
        alert('Login successful!');
    } else {
        alert('Invalid username or password!');
        document.getElementById('login-form').reset();
    }
}

function openAdminPanel() {
    if (isAdminAuthenticated) {
        showAdminPanel();
    } else {
        openLoginModal();
    }
}

function openLoginModal() {
    const loginModal = document.getElementById('login-modal');
    loginModal.style.display = 'flex';
    document.getElementById('login-form').reset();
}

function closeLoginModal() {
    const loginModal = document.getElementById('login-modal');
    loginModal.style.display = 'none';
}

function showAdminPanel() {
    const adminModal = document.getElementById('admin-modal');
    adminModal.style.display = 'flex';
    updateRentalList();
}

function closeAdminPanel() {
    const adminModal = document.getElementById('admin-modal');
    adminModal.style.display = 'none';
}

function logoutAdmin() {
    isAdminAuthenticated = false;
    closeAdminPanel();
    alert('Logged out successfully!');
}

// Keyboard shortcut to open login (Ctrl + Shift + A)
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        openAdminPanel();
    }
});

// ===============================
// RENTAL MANAGEMENT SYSTEM
// ===============================
let rentals = {}; // Format: { "category-itemId": [ { id, outDate, returnDate, rentedOn } ] }

async function loadRentals() {
    if (!hasDatabaseConfig()) {
        rentals = {};
        console.warn('Database config is missing. Rentals will not persist until db-config.js is filled in.');
        return;
    }

    await migrateLocalStorageToDatabase();
    await fetchAllRentalsFromDatabase();
}

// Check and remove expired rental intervals
function checkRentalExpiry(shouldSync = true) {
    const today = getTodayLocalDate();
    let updated = false;
    const expiredReservationIds = [];

    for (const key in rentals) {
        if (!Array.isArray(rentals[key])) continue;

        const filtered = rentals[key].filter(entry => {
            const isActive = entry.returnDate >= today;
            if (!isActive && entry.id) {
                expiredReservationIds.push(entry.id);
            }
            return isActive;
        });
        if (filtered.length === 0) {
            delete rentals[key];
            updated = true;
        } else if (filtered.length < rentals[key].length) {
            rentals[key] = filtered;
            updated = true;
        }
    }

    if (updated && shouldSync) {
        syncExpiredRentalsWithDatabase(expiredReservationIds).catch(error => {
            console.error(error);
        });
    }
}

// Get rental key for an item
function getRentalKey(category, itemId) {
    return `${category}-${itemId}`;
}

// Parse rental key into category and itemId safely
function parseRentalKey(key) {
    const lastDash = key.lastIndexOf('-');
    return {
        category: key.slice(0, lastDash),
        itemId: key.slice(lastDash + 1)
    };
}

// Check if two date ranges overlap
function rangesOverlap(startA, endA, startB, endB) {
    return startA <= endB && startB <= endA;
}

// Get rental status for item based on current date
function getRentalStatus(category, itemId) {
    const key = getRentalKey(category, itemId);
    const entries = rentals[key] || [];
    if (!entries.length) return null;

    const today = getTodayLocalDate();
    const current = entries.filter(entry => entry.outDate <= today && today <= entry.returnDate);
    const future = entries.filter(entry => today < entry.outDate).sort((a, b) => a.outDate.localeCompare(b.outDate));

    if (current.length) {
        return { status: 'rented', current, future, entries };
    }
    if (future.length) {
        return { status: 'reserved', current: [], future, entries };
    }
    return { status: 'expired', current: [], future: [], entries };
}

// Check if item is currently rented (active period)
function isItemRented(category, itemId) {
    const data = getRentalStatus(category, itemId);
    return data && data.status === 'rented';
}

// Add rental
async function addRental(event) {
    event.preventDefault();

    if (!hasDatabaseConfig()) {
        alert('Add your Supabase details to db-config.js first.');
        return;
    }

    const category = document.getElementById('rental-category').value;
    const selectedFile = document.getElementById('rental-item').value;
    const itemId = getItemIdFromFileName(category, selectedFile);
    const outDate = document.getElementById('rental-out-date').value;
    const returnDate = document.getElementById('rental-date').value;

    if (!category || !itemId || !outDate || !returnDate) {
        alert('Please fill all fields');
        return;
    }

    if (new Date(outDate) > new Date(returnDate)) {
        alert('Return date must be the same or after the out date.');
        return;
    }

    const key = getRentalKey(category, itemId);
    const entries = rentals[key] || [];

    for (const entry of entries) {
        if (rangesOverlap(entry.outDate, entry.returnDate, outDate, returnDate)) {
            alert('This date range conflicts with an existing reservation. Please select different dates.');
            return;
        }
    }

    const reservation = {
        id: crypto.randomUUID(),
        category,
        itemId,
        outDate: outDate,
        returnDate: returnDate,
        rentedOn: getTodayLocalDate()
    };

    try {
        await insertRentalIntoDatabase(reservation);
        rentals[key] = [...entries, reservation];
        document.getElementById('rental-form').reset();
        populateRentalItems('');
        updateRentalList();
        alert(`Item marked as rented: ${getItemLabel(category, itemId)}`);
    } catch (error) {
        console.error(error);
        alert('Unable to save rental to the database.');
    }
}

// Remove rental reservation
async function removeRental(key, reservationId) {
    if (!confirm('Remove this reservation?')) return;

    if (!rentals[key]) return;

    try {
        await deleteRentalFromDatabase(reservationId);
        rentals[key] = rentals[key].filter(entry => entry.id !== reservationId);

        if (rentals[key].length === 0) {
            delete rentals[key];
        }

        updateRentalList();
    } catch (error) {
        console.error(error);
        alert('Unable to delete rental from the database.');
    }
}

// Update rental list in admin panel
function updateRentalList() {
    const listContainer = document.getElementById('rental-list');
    checkRentalExpiry(); // Check for expired rentals first

    if (Object.keys(rentals).length === 0) {
        listContainer.innerHTML = '<p>No active rentals</p>';
        return;
    }

    let html = '';
    for (const key in rentals) {
        const { category, itemId } = parseRentalKey(key);
        const entries = rentals[key];

        entries.sort((a, b) => a.outDate.localeCompare(b.outDate));

        entries.forEach(entry => {
            const returnDate = new Date(entry.returnDate).toLocaleDateString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric'
            });

            const outDate = new Date(entry.outDate).toLocaleDateString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric'
            });

            html += `
                <div class="rental-item">
                    <div class="rental-item-info">
                        <strong>${getCategoryDetails(category)?.name || category} - ${getItemLabel(category, itemId)}</strong>
                        <small>Out: ${outDate} • Return: ${returnDate}</small>
                    </div>
                    <button class="rental-item-delete" type="button" data-rental-key="${key}" data-rental-id="${entry.id}">Remove</button>
                </div>
            `;
        });
    }

    listContainer.innerHTML = html;
}

// IMAGE MODAL FUNCTIONS
function openImageModal(imageSrc) {
    const modal = document.getElementById('image-modal');
    const modalImage = document.getElementById('modal-image');
    modalImage.src = imageSrc;
    modal.style.display = 'flex';
}

function closeImageModal() {
    const modal = document.getElementById('image-modal');
    modal.style.display = 'none';
}

function refreshRentalViews(shouldSync = true) {
    checkRentalExpiry(shouldSync);

    if (currentCategory || grid) {
        displayItems(currentCategory);
    }

    const adminModal = document.getElementById('admin-modal');
    if (adminModal && adminModal.style.display === 'flex') {
        updateRentalList();
    }
}

// Close modal when clicking outside the image
document.addEventListener('click', function(e) {
    const modal = document.getElementById('image-modal');
    if (e.target === modal) {
        closeImageModal();
    }
});

// DISPLAY FUNCTION
function displayItems(category = null) {
    if (!grid) grid = document.querySelector('.grid');
    if (!backButtonContainer) backButtonContainer = document.querySelector('#back-button-container');
    if (!paginationContainer) paginationContainer = document.querySelector('#pagination-container');
    
    if (!grid) {
        console.error('Grid element not found!');
        return;
    }
    
    grid.innerHTML = '';

    if (!category) {
        // Show category cards
        currentCategory = null;
        currentPage = 1;
        backButtonContainer.style.display = 'none';
        paginationContainer.style.display = 'none';
        paginationContainer.innerHTML = '';
        
        categoryCatalog.order.forEach(cat => {
            const details = getCategoryDetails(cat);
            const coverFile = details?.files?.[0];
            if (!details || !coverFile) return;

            const card = document.createElement('div');
            card.className = 'card';
            card.onclick = () => loadCategory(cat);

            card.innerHTML = `
                <img src="${getImageSrc(cat, coverFile)}" alt="${details.name}">
                <div class="card-overlay">
                    <h3>${details.name}</h3>
                    <p>${details.description}</p>
                </div>
            `;

            grid.appendChild(card);
        });
    } else {
        // Show items in category with pagination
        if (currentCategory !== category) {
            currentPage = 1;
        }

        currentCategory = category;
        backButtonContainer.style.display = 'block';

        const files = getCategoryFiles(category);
        const max = files.length;
        const totalPages = Math.max(1, Math.ceil(max / itemsPerPage));
        currentPage = Math.min(Math.max(currentPage, 1), totalPages);
        paginationContainer.style.display = totalPages > 1 ? 'flex' : 'none';
        const startIndex = (currentPage - 1) * itemsPerPage;
        const visibleFiles = files.slice(startIndex, startIndex + itemsPerPage);

        visibleFiles.forEach((fileName, index) => {
            const card = document.createElement('div');
            const itemNumber = startIndex + index + 1;
            const rentalData = getRentalStatus(category, itemNumber);
            const isRented = rentalData && rentalData.status === 'rented';
            card.className = isRented ? 'card rented' : 'card';

            const imageSrc = getImageSrc(category, fileName);
            const label = getDisplayLabel(fileName);
            let rentalBadge = '';
            let statusText = 'Click to view';

            if (rentalData) {
                const badges = [];
                if (rentalData.current && rentalData.current.length) {
                    rentalData.current.forEach(entry => {
                        const returnDate = new Date(entry.returnDate).toLocaleDateString('en-US', {
                            year: 'numeric', month: 'short', day: 'numeric'
                        });
                        badges.push(`<span class="status rented">RENTED - Return: ${returnDate}</span>`);
                    });
                    statusText = 'Currently Rented';
                }

                if (rentalData.future && rentalData.future.length) {
                    rentalData.future.forEach(entry => {
                        const outDate = new Date(entry.outDate).toLocaleDateString('en-US', {
                            year: 'numeric', month: 'short', day: 'numeric'
                        });
                        const returnDate = new Date(entry.returnDate).toLocaleDateString('en-US', {
                            year: 'numeric', month: 'short', day: 'numeric'
                        });
                        badges.push(`<span class="status reserved">RESERVED ${outDate} – ${returnDate}</span>`);
                    });
                    if (!isRented) {
                        const next = rentalData.future[0];
                        statusText = `Reserved ${new Date(next.outDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} – ${new Date(next.returnDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`;
                    }
                }

                if (badges.length) {
                    rentalBadge = `<div class="status-stack">${badges.join('')}</div>`;
                }
            }

            card.innerHTML = `
                ${rentalBadge}
                <img src="${imageSrc}" alt="${label}" style="cursor: pointer;">
                <div class="card-overlay">
                    <h3>${label}</h3>
                    <p>${statusText}</p>
                </div>
            `;

            if (!isRented) {
                card.querySelector('img').addEventListener('click', () => openImageModal(imageSrc));
            } else {
                card.style.opacity = '0.6';
            }
            
            grid.appendChild(card);
        });

        renderPagination(max, totalPages);
    }
    
    console.log('Grid updated');
}

function renderPagination(totalItems, totalPages) {
    if (!paginationContainer) paginationContainer = document.querySelector('#pagination-container');
    paginationContainer.innerHTML = '';

    const prevButton = document.createElement('button');
    prevButton.textContent = 'Previous';
    prevButton.disabled = currentPage <= 1;
    prevButton.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage -= 1;
            displayItems(currentCategory);
            window.scrollTo({ top: document.querySelector('#collection').offsetTop - 80, behavior: 'smooth' });
        }
    });
    paginationContainer.appendChild(prevButton);

    for (let page = 1; page <= totalPages; page++) {
        const pageButton = document.createElement('button');
        pageButton.textContent = page;
        pageButton.className = page === currentPage ? 'active' : '';
        pageButton.disabled = page === currentPage;
        pageButton.addEventListener('click', () => {
            currentPage = page;
            displayItems(currentCategory);
            window.scrollTo({ top: document.querySelector('#collection').offsetTop - 80, behavior: 'smooth' });
        });
        paginationContainer.appendChild(pageButton);
    }

    const nextButton = document.createElement('button');
    nextButton.textContent = 'Next';
    nextButton.disabled = currentPage >= totalPages;
    nextButton.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage += 1;
            displayItems(currentCategory);
            window.scrollTo({ top: document.querySelector('#collection').offsetTop - 80, behavior: 'smooth' });
        }
    });
    paginationContainer.appendChild(nextButton);
}

// LOAD CATEGORY FUNCTION
function loadCategory(category) {
    console.log('Loading category:', category);
    currentPage = 1;
    displayItems(category);
}

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', async function() {
    try {
        await loadRentals();
    } catch (error) {
        console.error(error);
        alert('Rental database could not be loaded. Check db-config.js and your Supabase setup.');
    }
    
    // Initialize grid with categories on page load
    displayItems();
    populateRentalItems();

    const rentalCategorySelect = document.getElementById('rental-category');
    if (rentalCategorySelect) {
        rentalCategorySelect.addEventListener('change', event => {
            populateRentalItems(event.target.value);
        });
    }

    refreshRentalViews(false);
    window.setInterval(() => refreshRentalViews(), 60000);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            refreshRentalViews();
        }
    });
    window.addEventListener('focus', () => refreshRentalViews());
    
    // 1. Navbar Background Change on Scroll
    const navbar = document.getElementById('navbar');
    
    window.addEventListener('scroll', function() {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Admin rental remove delegation
    const rentalList = document.getElementById('rental-list');
    if (rentalList) {
        rentalList.addEventListener('click', function(event) {
            const button = event.target.closest('.rental-item-delete');
            if (button && button.dataset.rentalKey && button.dataset.rentalId) {
                removeRental(button.dataset.rentalKey, button.dataset.rentalId);
            }
        });
    }

    // 2. Scroll Reveal Animation (Intersection Observer)
    const revealElements = document.querySelectorAll('.reveal');

    const revealObserver = new IntersectionObserver(function(entries, observer) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                // Optional: Stop observing once revealed
                observer.unobserve(entry.target);
            }
        });
    }, {
        root: null,
        threshold: 0.15, // Trigger when 15% of element is visible
        rootMargin: "0px 0px -50px 0px"
    });

    revealElements.forEach(function(el) {
        revealObserver.observe(el);
    });

    // 3. Smooth Scroll for Navigation Links
    const navLinks = document.querySelectorAll('.nav-links a');

    navLinks.forEach(function(link) {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            
            if (targetSection) {
                const offsetTop = targetSection.offsetTop - 80;
                window.scrollTo({
                    top: offsetTop,
                    behavior: 'smooth'
                });
            }
        });
    });

    // 4. Card Hover Effect (Add subtle scale on mouse move)
    const cards = document.querySelectorAll('.card');

    cards.forEach(function(card) {
        card.addEventListener('mousemove', function(e) {
            const rect = this.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const rotateX = ((y - centerY) / centerY) * -2;
            const rotateY = ((x - centerX) / centerX) * 2;
            
            this.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
        });

        card.addEventListener('mouseleave', function() {
            this.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale3d(1, 1, 1)';
        });
    });

    // 5. Page is ready - ensure visibility
    document.body.style.opacity = '1';
    
    console.log('✓ Page loaded - Grid initialized');
});
