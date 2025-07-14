import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getDatabase, ref, onValue, set, remove, push } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDcxQLLka_eZ5tduUW3zEAKKdKMvebeXRI",
  authDomain: "job-card-8bb4b.firebaseapp.com",
  databaseURL: "https://job-card-8bb4b-default-rtdb.firebaseio.com",
  projectId: "job-card-8bb4b",
  storageBucket: "job-card-8bb4b.firebasestorage.app",
  messagingSenderId: "355622785459",
  appId: "1:355622785459:web:fc49655132c77fb9cbfbc6",
  measurementId: "G-T7EET4NRQR"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

const jobsTableBody = document.querySelector('#jobsTable tbody');
const statusDiv = document.getElementById('status');
const personModal = document.getElementById('personModal');
const personSelect = document.getElementById('personSelect');
const selectPersonBtn = document.getElementById('selectPersonBtn');
const changePersonBtn = document.getElementById('changePersonBtn');
const clientListDiv = document.getElementById('clientList');
const clientModal = document.getElementById('clientModal');
const clientModalContent = document.getElementById('clientModalContent');

let allJobs = [];
let jobKeyMap = {};
let selectedPerson = null;
let isManualUpdate = false;
let animatedClients = new Set();
const allowedPeople = ["Andre", "Francois", "Yolandie", "Neil"];

function populatePersonSelect(people) {
    personSelect.innerHTML = '<option value="">-- Select Person --</option>';
    allowedPeople.forEach(person => {
        const option = document.createElement('option');
        option.value = person;
        option.textContent = person;
        personSelect.appendChild(option);
    });
}

function showPersonModal() {
    personModal.style.display = 'flex';
    changePersonBtn.style.display = 'none';
    const currentUserDisplay = document.getElementById('currentUserDisplay');
    if (currentUserDisplay) currentUserDisplay.textContent = '';
}

function hidePersonModal() {
    personModal.style.display = 'none';
    changePersonBtn.style.display = 'inline-block';
}

function loadJobsAndPeople() {
    const jobsRef = ref(database, 'jobCards');
    onValue(jobsRef, (snapshot) => {
        allJobs = [];
        jobKeyMap = {};
        if (snapshot.exists()) {
            const val = snapshot.val();
            for (const [key, job] of Object.entries(val)) {
                allJobs.push({...job, _key: key});
                jobKeyMap[job.id || job.customerCell || key] = key;
            }
            // Get unique people from assignedTo
            const peopleSet = new Set();
            allJobs.forEach(job => {
                if (job.assignedTo) peopleSet.add(job.assignedTo);
            });
            const people = Array.from(peopleSet).sort();
            populatePersonSelect(people);
            renderClientList();
            if (statusDiv) statusDiv.textContent = '';
        } else {
            allJobs = [];
            jobKeyMap = {};
            populatePersonSelect([]);
            renderClientList();
            if (statusDiv) statusDiv.textContent = 'No jobs found.';
        }
    }, (error) => {
        if (statusDiv) statusDiv.textContent = 'Error loading jobs: ' + error.message;
    });
}

selectPersonBtn.addEventListener('click', () => {
    const person = personSelect.value;
    if (!person) {
        if (statusDiv) statusDiv.textContent = 'Please select a person.';
        return;
    }
    selectedPerson = person;
    hidePersonModal();
    
    // Check and show welcome back message
    checkAndShowWelcomeBack(person);
    
    renderJobsForPerson(selectedPerson);
});

changePersonBtn.addEventListener('click', () => {
    selectedPerson = null;
    showPersonModal();
    jobsTableBody.innerHTML = '';
    if (statusDiv) statusDiv.textContent = '';
});

// Initial load
showPersonModal();
loadJobsAndPeople();

// Auto-refresh client list every 3 seconds
setInterval(() => {
    if (selectedPerson && !isManualUpdate) {
        // Refresh allJobs from Firebase
        const jobsRef = ref(database, 'jobCards');
        onValue(jobsRef, (snapshot) => {
            allJobs = [];
            jobKeyMap = {};
            if (snapshot.exists()) {
                const val = snapshot.val();
                for (const [key, job] of Object.entries(val)) {
                    allJobs.push({...job, _key: key});
                    jobKeyMap[job.id || job.customerCell || key] = key;
                }
            }
            // Re-render the filtered jobs for the selected person
            const jobs = allJobs.filter(job => job.assignedTo === selectedPerson && !isJobInRecycle(job));
            if (jobs.length === 0) {
                if (statusDiv) statusDiv.textContent = `No jobs found for ${selectedPerson}.`;
                return;
            }
            if (statusDiv) statusDiv.textContent = '';
            const clientMap = groupJobsByClient(jobs);
            renderFilteredClientList(clientMap);
        }, (error) => {
            console.error('Auto-refresh error:', error);
        });
    }
}, 3000);

// Modal logic
const descModal = document.getElementById('descModal');
const descModalContent = document.getElementById('descModalContent');
const jobNotesInput = document.getElementById('jobNotesInput');
const saveNotesBtn = document.getElementById('saveNotesBtn');
const closeDescModal = document.getElementById('closeDescModal');
let currentModalJobId = null;
let currentModalMode = 'desc';

function openDescModal(jobId, mode) {
    currentModalJobId = jobId;
    currentModalMode = mode;
    const job = allJobs.find(j => (j.id || j.customerCell || '') == jobId);
    if (!job) return;
    descModal.style.display = 'flex';
    if (mode === 'desc') {
        descModalContent.textContent = job.jobDescription || '';
        jobNotesInput.style.display = 'none';
        saveNotesBtn.style.display = 'none';
        descModalContent.style.display = 'block';
    } else {
        descModalContent.style.display = 'none';
        jobNotesInput.style.display = 'block';
        saveNotesBtn.style.display = 'block';
        jobNotesInput.value = localStorage.getItem('jobNotes_' + jobId) || '';
    }
}
closeDescModal.addEventListener('click', () => {
    descModal.style.display = 'none';
    currentModalJobId = null;
});
saveNotesBtn.addEventListener('click', () => {
    if (!currentModalJobId) return;
    localStorage.setItem('jobNotes_' + currentModalJobId, jobNotesInput.value);
    descModal.style.display = 'none';
    renderJobsForPerson(selectedPerson);
});
descModal.addEventListener('click', (e) => {
    if (e.target === descModal) descModal.style.display = 'none';
});

// Recycle bin logic
function isJobInRecycle(job) {
    const recycle = getRecycleBin();
    return recycle.some(j => j.jobId === job._key);
}
function getRecycleBin() {
    let recycle = localStorage.getItem('recycleBin');
    if (!recycle) return [];
    try { return JSON.parse(recycle); } catch { return []; }
}
function setRecycleBin(arr) {
    localStorage.setItem('recycleBin', JSON.stringify(arr));
}
function addToRecycleBin(job) {
    const recycle = getRecycleBin();
    recycle.push({
        jobId: job._key,
        job,
        deletedOn: Date.now()
    });
    setRecycleBin(recycle);
}
function removeFromRecycleBin(jobId) {
    let recycle = getRecycleBin();
    recycle = recycle.filter(j => j.jobId !== jobId);
    setRecycleBin(recycle);
}
function cleanOldRecycleBin() {
    let recycle = getRecycleBin();
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const toDelete = recycle.filter(j => j.deletedOn < weekAgo);
    toDelete.forEach(j => {
        // Remove from Firebase
        if (j.job && (j.job.id || j.job.customerCell)) {
            const jobKey = j.job.id || j.job.customerCell;
            remove(ref(database, 'jobCards/' + jobKey));
        }
    });
    recycle = recycle.filter(j => j.deletedOn >= weekAgo);
    setRecycleBin(recycle);
}

// Add event listeners for recycle bin modal
const openRecycleBinBtn = document.getElementById('openRecycleBinBtn');
const recycleBinModal = document.getElementById('recycleBinModal');
const closeRecycleBinBtn = document.getElementById('closeRecycleBinBtn');
openRecycleBinBtn.addEventListener('click', () => {
    renderRecycleBin();
    recycleBinModal.style.display = 'flex';
});
closeRecycleBinBtn.addEventListener('click', () => {
    recycleBinModal.style.display = 'none';
});
document.body.addEventListener('click', function(e) {
    if (e.target === recycleBinModal) {
        recycleBinModal.style.display = 'none';
    }
});

function renderRecycleBin() {
    cleanOldRecycleBin();
    const recycle = getRecycleBin();
    const recycleTable = document.getElementById('recycleTable');
    const recycleStatus = document.getElementById('recycleStatus');
    const tbody = recycleTable.querySelector('tbody');
    tbody.innerHTML = '';
    
    // Filter recycle bin to show only jobs for the currently selected user
    const userRecycle = selectedPerson ? recycle.filter(j => j.job && j.job.assignedTo === selectedPerson) : [];
    
    if (userRecycle.length === 0) {
        recycleTable.style.display = 'none';
        recycleStatus.textContent = selectedPerson ? `No deleted jobs found for ${selectedPerson}.` : 'Please select a user to view their deleted jobs.';
        return;
    }
    recycleTable.style.display = '';
    recycleStatus.textContent = '';
    userRecycle.forEach(j => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${safeField(j.job.customerName)}</td>
            <td>${safeField(j.job.date)}</td>
            <td>${safeField(j.job.customerCell)}</td>
            <td>${safeField((j.job.jobDescription || '').slice(0,40) + ((j.job.jobDescription||'').length>40?'...':''))}</td>
            <td>${safeField(j.job.assignedTo)}</td>
            <td>${safeField(localStorage.getItem('jobNotes_' + (j.job.id || j.job.customerCell || '')))}</td>
            <td>${j.job.deletedOn ? new Date(j.deletedOn).toLocaleDateString() : '—'}</td>
            <td><button class="restore-btn" data-jobid="${j.jobId}">Restore</button></td>
            <td><button class="delete-forever-btn" data-jobid="${j.jobId}">Delete Forever</button></td>
        `;
        tbody.appendChild(tr);
    });
    document.querySelectorAll('.restore-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const jobId = e.target.dataset.jobid;
            // Restore job to Firebase
            const recycle = getRecycleBin();
            const entry = recycle.find(j => j.jobId === jobId);
            if (entry && entry.job) {
                // Use the same key if possible
                const fbKey = jobKeyMap[jobId] || undefined;
                const jobRef = fbKey ? ref(database, 'jobCards/' + fbKey) : push(ref(database, 'jobCards'));
                set(jobRef, entry.job).then(() => {
                    removeFromRecycleBin(jobId);
                    writeLog({user: entry.job.assignedTo, action: 'restored', jobName: entry.job.customerName});
                    renderClientList();
                    renderRecycleBin();
                });
            }
        });
    });
    document.querySelectorAll('.delete-forever-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const jobId = e.target.dataset.jobid;
            const recycle = getRecycleBin();
            const entry = recycle.find(j => j.jobId === jobId);
            removeFromRecycleBin(jobId);
            // Also remove from Firebase
            const fbKey = jobKeyMap[jobId];
            if (fbKey) remove(ref(database, 'jobCards/' + fbKey));
            // Remove from allJobs in memory
            allJobs = allJobs.filter(j => j._key !== jobId);
            writeLog({user: entry && entry.job ? entry.job.assignedTo : '—', action: 'deleted forever', jobName: entry && entry.job ? entry.job.customerName : jobId});
            renderClientList();
            renderRecycleBin();
        });
    });
}

// Delete modal logic
const deleteModal = document.getElementById('deleteModal');
const closeDeleteModal = document.getElementById('closeDeleteModal');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
let currentDeleteJobId = null;

window.openDeleteModal = function(jobId) {
    currentDeleteJobId = jobId;
    // Hide all other modals
    if (clientModal) clientModal.style.display = 'none';
    if (descModal) descModal.style.display = 'none';
    if (recycleBinModal) recycleBinModal.style.display = 'none';
    if (logModal) logModal.style.display = 'none';
    deleteModal.style.display = 'flex';
    deleteModal.style.zIndex = '5000';
    // Focus the cancel button for accessibility
    if (cancelDeleteBtn) cancelDeleteBtn.focus();
    // Attach event listener to confirmDeleteBtn every time modal opens
    if (confirmDeleteBtn) {
        confirmDeleteBtn.onclick = function() {
            console.log('Move to Recycle Bin clicked, jobId:', currentDeleteJobId);
            if (!currentDeleteJobId) return;
            // Find job robustly
            const job = allJobs.find(j => jobKeyMap[j.id || j.customerCell || ''] === currentDeleteJobId || (j.id || j.customerCell || '') === currentDeleteJobId);
            if (!job) return;
            addToRecycleBin(job);
            // Remove from Firebase (soft delete)
            const fbKey = jobKeyMap[job.id || job.customerCell || ''] || currentDeleteJobId;
            if (fbKey) remove(ref(database, 'jobCards/' + fbKey));
            writeLog({user: job.assignedTo, action: 'deleted', jobName: job.customerName});
            deleteModal.style.display = 'none';
            renderClientList();
            renderRecycleBin();
            currentDeleteJobId = null;
        };
    }
};

if (closeDeleteModal) closeDeleteModal.addEventListener('click', () => {
    deleteModal.style.display = 'none';
    currentDeleteJobId = null;
});
if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', () => {
    deleteModal.style.display = 'none';
    currentDeleteJobId = null;
});
if (deleteModal) deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) {
        deleteModal.style.display = 'none';
        currentDeleteJobId = null;
    }
});

function groupJobsByClient(jobs) {
    const map = new Map();
    jobs.forEach(job => {
        if (!job.customerName) return;
        // Find the original job object from allJobs (by key)
        const original = allJobs.find(j => j._key === job._key);
        const jobRef = original || job;
        if (!map.has(jobRef.customerName)) map.set(jobRef.customerName, []);
        map.get(jobRef.customerName).push(jobRef);
    });
    return map;
}

function renderClientList() {
    clientListDiv.innerHTML = '';
    const clientMap = groupJobsByClient(allJobs.filter(job => !isJobInRecycle(job)));
    if (clientMap.size === 0) {
        if (statusDiv) statusDiv.textContent = 'No jobs found.';
        return;
    }
    if (statusDiv) statusDiv.textContent = '';
    for (const [client, jobs] of clientMap.entries()) {
        const btn = document.createElement('button');
        btn.className = 'client-name';
        btn.textContent = `${client} (${jobs.length})`;
        btn.onclick = () => openClientModal(client, jobs);
        clientListDiv.appendChild(btn);
    }
}

function formatRand(amount) {
    if (!amount || isNaN(amount)) return 'R 0.00';
    return 'R ' + Number(amount).toFixed(2);
}

function safeField(val) {
    return (val !== undefined && val !== null && val !== "") ? val : "—";
}
function safeList(arr) {
    return Array.isArray(arr) && arr.length > 0 ? arr.join(', ') : '—';
}

function openClientModal(client, jobs) {
    let html = `<button class='close-modal-btn' onclick='document.getElementById("clientModal").style.display="none"'>&times;</button>`;
    html += `<h2>${client}</h2>`;
    jobs.forEach((job, idx) => {
        const jobId = job._key;
        html += `<div class='a4-job-details'>
            <h3>Job #${idx + 1}</h3>
            <table>
                <tr><th>Date</th><td>${safeField(job.date)}</td></tr>
                <tr><th>Customer Cell Number</th><td>${safeField(job.customerCell)}</td></tr>
                <tr><th>Email</th><td>${safeField(job.email)}</td></tr>
                <tr><th>Job Total</th><td>${job.jobTotal ? formatRand(job.jobTotal) : '—'}</td></tr>
                <tr><th>Deposit</th><td>${job.deposit ? formatRand(job.deposit) : '—'}</td></tr>
                <tr><th>Balance Due</th><td>${job.balanceDue ? formatRand(job.balanceDue) : '—'}</td></tr>
                <tr><th>Stickers</th><td>${safeList(job.stickers)}</td></tr>
                <tr><th>Other</th><td>${safeList(job.other)}</td></tr>
                <tr><th>Banner/Canvas</th><td>${safeList(job.banner_canvas)}</td></tr>
                <tr><th>Boards</th><td>${safeList(job.boards)}</td></tr>
                <tr><th>Description</th><td>${safeField(job.jobDescription)}</td></tr>
                <tr><th>Assigned To</th><td>${safeField(job.assignedTo)}</td></tr>
            </table>
            <button class='edit-job-btn' data-jobid='${jobId}' style='margin-top:12px;background:#7c3aed;color:#fff;border:none;padding:10px 22px;border-radius:7px;font-size:1rem;cursor:pointer;margin-right:10px;'>Edit</button>
            <button class='send-along-btn' data-jobid='${jobId}' style='margin-top:12px;background:#38bdf8;color:#fff;border:none;padding:10px 22px;border-radius:7px;font-size:1rem;cursor:pointer;margin-right:10px;'>Send It Along</button>
            <button class='save-pdf-btn' data-jobid='${jobId}' style='margin-top:12px;background:#10b981;color:#fff;border:none;padding:10px 22px;border-radius:7px;font-size:1rem;cursor:pointer;margin-right:10px;'>Save as PDF</button>
            <button class='delete-job-btn' data-jobid='${jobId}' style='margin-top:12px;background:#b23c3c;color:#fff;border:none;padding:10px 22px;border-radius:7px;font-size:1rem;cursor:pointer;'>Delete Job</button>
        </div>`;
    });
    clientModalContent.innerHTML = html;
    clientModal.style.display = 'flex';
}

document.body.addEventListener('click', function(e) {
    if (e.target.classList.contains('close-modal-btn')) {
        if (e.target.id === 'closeEditJobModalBtn') {
            document.getElementById('editJobModal').style.display = 'none';
            document.getElementById('editJobStatus').textContent = '';
        } else if (e.target.id === 'closeSendAlongModalBtn') {
            document.getElementById('sendAlongModal').style.display = 'none';
            document.getElementById('sendAlongStatus').textContent = '';
        } else {
            clientModal.style.display = 'none';
        }
    }
    if (e.target === clientModal) {
        clientModal.style.display = 'none';
    }
    if (e.target.classList.contains('edit-job-btn')) {
        const jobId = e.target.dataset.jobid;
        const job = allJobs.find(j => j._key === jobId);
        if (!job) return;
        openEditJobModal(job);
    }
    if (e.target.classList.contains('send-along-btn')) {
        const jobId = e.target.dataset.jobid;
        const job = allJobs.find(j => j._key === jobId);
        if (!job) return;
        openSendAlongModal(job);
    }
    if (e.target.classList.contains('save-pdf-btn')) {
        const jobId = e.target.dataset.jobid;
        const job = allJobs.find(j => j._key === jobId);
        if (!job) return;
        generatePDF(job);
    }
    if (e.target.classList.contains('delete-job-btn')) {
        const jobId = e.target.dataset.jobid;
        clientModal.style.display = 'none';
        // Find the job by unique _key
        const job = allJobs.find(j => j._key === jobId);
        console.log('[DELETE DEBUG] Attempting to delete job:', jobId, job);
        if (!job) return;
        addToRecycleBin(job);
        // Remove from Firebase (soft delete)
        if (jobId) {
            remove(ref(database, 'jobCards/' + jobId)).then(() => {
                console.log('[DELETE DEBUG] Successfully removed from Firebase:', jobId);
            }).catch(err => {
                console.error('[DELETE DEBUG] Error removing from Firebase:', jobId, err);
            });
        }
        // Remove from allJobs in memory (robust)
        allJobs = allJobs.filter(j => j._key !== jobId);
        writeLog({user: job.assignedTo, action: 'deleted', jobName: job.customerName});
        renderClientList();
        renderRecycleBin();
    }
});

function openEditJobModal(job) {
    const modal = document.getElementById('editJobModal');
    const form = document.getElementById('editJobForm');
    const status = document.getElementById('editJobStatus');
    status.textContent = '';
    // Build form fields
    form.innerHTML = `
        <label>Date:<br><input type="date" name="date" value="${job.date || ''}" required></label><br>
        <label>Customer Name:<br><input type="text" name="customerName" value="${job.customerName || ''}" required></label><br>
        <label>Customer Cell Number:<br><input type="text" name="customerCell" value="${job.customerCell || ''}" required></label><br>
        <label>Email:<br><input type="email" name="email" value="${job.email || ''}"></label><br>
        <label>Job Total:<br><input type="number" step="0.01" name="jobTotal" value="${job.jobTotal || ''}"></label><br>
        <label>Deposit:<br><input type="number" step="0.01" name="deposit" value="${job.deposit || ''}"></label><br>
        <label>Balance Due:<br><input type="number" step="0.01" name="balanceDue" value="${job.balanceDue || ''}"></label><br>
        <label>Stickers:<br><input type="text" name="stickers" value="${Array.isArray(job.stickers) ? job.stickers.join(', ') : (job.stickers || '')}"></label><br>
        <label>Other:<br><input type="text" name="other" value="${Array.isArray(job.other) ? job.other.join(', ') : (job.other || '')}"></label><br>
        <label>Banner/Canvas:<br><input type="text" name="banner_canvas" value="${Array.isArray(job.banner_canvas) ? job.banner_canvas.join(', ') : (job.banner_canvas || '')}"></label><br>
        <label>Boards:<br><input type="text" name="boards" value="${Array.isArray(job.boards) ? job.boards.join(', ') : (job.boards || '')}"></label><br>
        <label>Description:<br><textarea name="jobDescription" rows="3">${job.jobDescription || ''}</textarea></label><br>
        <label>Assigned To:<br><input type="text" name="assignedTo" value="${job.assignedTo || ''}"></label><br>
        <button type="submit" class="btn" style="margin-top:10px;">Save Changes</button>
    `;
    form.onsubmit = function(ev) {
        ev.preventDefault();
        const formData = new FormData(form);
        const updatedJob = {
            ...job,
            date: formData.get('date'),
            customerName: formData.get('customerName'),
            customerCell: formData.get('customerCell'),
            email: formData.get('email'),
            jobTotal: formData.get('jobTotal'),
            deposit: formData.get('deposit'),
            balanceDue: formData.get('balanceDue'),
            stickers: formData.get('stickers') ? formData.get('stickers').split(',').map(s => s.trim()).filter(Boolean) : [],
            other: formData.get('other') ? formData.get('other').split(',').map(s => s.trim()).filter(Boolean) : [],
            banner_canvas: formData.get('banner_canvas') ? formData.get('banner_canvas').split(',').map(s => s.trim()).filter(Boolean) : [],
            boards: formData.get('boards') ? formData.get('boards').split(',').map(s => s.trim()).filter(Boolean) : [],
            jobDescription: formData.get('jobDescription'),
            assignedTo: formData.get('assignedTo'),
        };
        // Save to Firebase
        set(ref(database, 'jobCards/' + job._key), updatedJob)
            .then(() => {
                status.style.color = '#7c3aed';
                status.textContent = 'Job card updated!';
                setTimeout(() => {
                    modal.style.display = 'none';
                    status.textContent = '';
                    renderClientList();
                }, 1200);
                writeLog({user: updatedJob.assignedTo, action: 'edited', jobName: updatedJob.customerName});
            })
            .catch((err) => {
                status.style.color = '#e11d48';
                status.textContent = 'Error: ' + err.message;
            });
    };
    modal.style.display = 'flex';
}

function openSendAlongModal(job) {
    const modal = document.getElementById('sendAlongModal');
    const form = document.getElementById('sendAlongForm');
    const status = document.getElementById('sendAlongStatus');
    const userSelect = document.getElementById('sendAlongUser');
    status.textContent = '';
    // Populate user list, excluding current assignedTo
    userSelect.innerHTML = '';
    allowedPeople.filter(p => p !== job.assignedTo).forEach(person => {
        const opt = document.createElement('option');
        opt.value = person;
        opt.textContent = person;
        userSelect.appendChild(opt);
    });
    form.onsubmit = function(ev) {
        ev.preventDefault();
        const newUser = userSelect.value;
        if (!newUser) {
            status.textContent = 'Please select a user.';
            return;
        }
        // Update job in Firebase
        const updatedJob = {...job, assignedTo: newUser};
        set(ref(database, 'jobCards/' + job._key), updatedJob)
            .then(() => {
                status.style.color = '#38bdf8';
                status.textContent = 'Job sent along!';
                // Show popup notification
                showPopupNotification(`Job sent to ${newUser}!`, 'success', 4000);
                // Set manual update flag to prevent auto-refresh interference
                isManualUpdate = true;
                // Instantly update UI: close modal, remove job from allJobs, return to client list, and refresh
                modal.style.display = 'none';
                status.textContent = '';
                clientModal.style.display = 'none';
                // Remove job from allJobs in memory
                allJobs = allJobs.filter(j => j._key !== job._key);
                renderClientList();
                writeLog({user: newUser, action: 'sent along', jobName: job.customerName, details: `from ${job.assignedTo}`});
                // Clear manual update flag after 5 seconds to allow auto-refresh to resume
                setTimeout(() => {
                    isManualUpdate = false;
                }, 5000);
            })
            .catch((err) => {
                status.style.color = '#e11d48';
                status.textContent = 'Error: ' + err.message;
            });
    };
    modal.style.display = 'flex';
}

function generatePDF(job) {
    const jsPDFLib = window.jspdf && window.jspdf.jsPDF ? window.jspdf.jsPDF : null;
    if (!jsPDFLib) {
        alert('PDF library not loaded. Please check your internet connection or try again.');
        return;
    }
    const doc = new jsPDFLib();

    // Professional header with light grey background
    doc.setFillColor(128, 128, 128);
    doc.rect(0, 0, 210, 40, 'F');
    
    // White text on grey background
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('JOB CARD', 105, 20, { align: 'center' });
    
    doc.setFontSize(16);
    doc.text(job.customerName || 'Customer', 105, 32, { align: 'center' });

    // Reset text color for content
    doc.setTextColor(0, 0, 0);
    
    // Add lines for manual entry at the top left and top right
    doc.setFontSize(14);
    doc.setTextColor(80, 80, 80);
    // Top left
    doc.text('Invoice NO: ___________', 20, 45, { align: 'left' });
    doc.text('Quote NO: ____________', 20, 52, { align: 'left' });
    // Top right
    doc.text('Order Number: __________', 150, 45, { align: 'left' });
    doc.text('Jobcard No: ___________', 150, 52, { align: 'left' });

    // Add job details in the specified order with professional styling
    doc.setFontSize(12);
    let y = 55;

    const details = [
        ['Customer Name', safeField(job.customerName)],
        ['Cell Number', safeField(job.customerCell)],
        ['Email', safeField(job.email)],
        ['Description', safeField(job.jobDescription)],
        ['Stickers', safeList(job.stickers)],
        ['Other', safeList(job.other)],
        ['Banner', safeList(job.banner_canvas)],
        ['Boards', safeList(job.boards)],
        ['Deposit', job.deposit ? formatRand(job.deposit) : '—'],
        ['Balance Due', job.balanceDue ? formatRand(job.balanceDue) : '—'],
        ['Job Total', job.jobTotal ? formatRand(job.jobTotal) : '—'],
        ['Assigned To', safeField(job.assignedTo)],
        ['Job Card Created', safeField(job.date)]
    ];

    doc.autoTable({
        startY: y,
        head: [['Field', 'Value']],
        body: details,
        theme: 'grid',
        headStyles: { 
            fillColor: [128, 128, 128],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 12
        },
        bodyStyles: {
            fontSize: 11,
            lineColor: [200, 200, 200],
            lineWidth: 0.1,
            textColor: [80, 80, 80]
        },
        alternateRowStyles: {
            fillColor: [248, 249, 250]
        },
        margin: { top: 10, right: 20, bottom: 20, left: 20 },
        styles: {
            overflow: 'linebreak',
            cellWidth: 'auto'
        },
        columnStyles: {
            0: { cellWidth: 50, fontStyle: 'bold' },
            1: { cellWidth: 120 }
        }
    });

    // Add footer
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text('Generated on: ' + new Date().toLocaleDateString(), 20, pageHeight - 35);
    doc.text('Job Card System', 190, pageHeight - 35, { align: 'right' });

    // Add manual fill-in fields at the bottom left
    doc.setFontSize(12);
    doc.setTextColor(80, 80, 80);
    doc.text('Client Signature: __________', 20, pageHeight - 55);
    doc.text('Collection Date: ___________', 20, pageHeight - 48);

    // Save the PDF directly
    const filename = `JobCard_${(job.customerName || '').replace(/\s+/g, '_')}_${job.date || ''}.pdf`;
    doc.save(filename);
}

function applyUserTheme(user) {
    const root = document.documentElement;
    
    switch(user) {
        case 'Neil':
            // Teal blue gradient
            root.style.setProperty('--primary-color', '#0ea5e9');
            root.style.setProperty('--secondary-color', '#0891b2');
            root.style.setProperty('--accent-color', '#06b6d4');
            root.style.setProperty('--gradient-start', '#0ea5e9');
            root.style.setProperty('--gradient-end', '#0891b2');
            root.style.setProperty('--primary-color-rgb', '14, 165, 233');
            break;
        case 'Yolandie':
            // Pink purple gradient
            root.style.setProperty('--primary-color', '#ec4899');
            root.style.setProperty('--secondary-color', '#a855f7');
            root.style.setProperty('--accent-color', '#c084fc');
            root.style.setProperty('--gradient-start', '#ec4899');
            root.style.setProperty('--gradient-end', '#a855f7');
            root.style.setProperty('--primary-color-rgb', '236, 72, 153');
            break;
        case 'Francois':
            // Green gradient
            root.style.setProperty('--primary-color', '#10b981');
            root.style.setProperty('--secondary-color', '#059669');
            root.style.setProperty('--accent-color', '#34d399');
            root.style.setProperty('--gradient-start', '#10b981');
            root.style.setProperty('--gradient-end', '#059669');
            root.style.setProperty('--primary-color-rgb', '16, 185, 129');
            break;
        case 'Andre':
            // Golden gradient
            root.style.setProperty('--primary-color', '#f59e0b');
            root.style.setProperty('--secondary-color', '#d97706');
            root.style.setProperty('--accent-color', '#fbbf24');
            root.style.setProperty('--gradient-start', '#f59e0b');
            root.style.setProperty('--gradient-end', '#d97706');
            root.style.setProperty('--primary-color-rgb', '245, 158, 11');
            break;
        default:
            // Default purple theme
            root.style.setProperty('--primary-color', '#7c3aed');
            root.style.setProperty('--secondary-color', '#38bdf8');
            root.style.setProperty('--accent-color', '#8b5cf6');
            root.style.setProperty('--gradient-start', '#7c3aed');
            root.style.setProperty('--gradient-end', '#38bdf8');
            root.style.setProperty('--primary-color-rgb', '124, 58, 237');
    }
    
    // Specifically target client buttons and ensure they use the correct theme
    const clientButtons = document.querySelectorAll('.client-list .client-name');
    clientButtons.forEach(btn => {
        btn.style.background = `linear-gradient(90deg, var(--gradient-start) 0%, var(--gradient-end) 100%)`;
        btn.style.color = '#fff';
        btn.style.boxShadow = `0 4px 15px rgba(var(--primary-color-rgb), 0.15)`;
    });
    
    // Apply theme to specific elements that might not use CSS variables
    const buttons = document.querySelectorAll('button, .btn, input[type="submit"]');
    buttons.forEach(btn => {
        if (btn.style.background && btn.style.background.includes('7c3aed')) {
            btn.style.background = `linear-gradient(90deg, var(--gradient-start) 0%, var(--gradient-end) 100%)`;
        }
    });
    
    // Update any inline styles that might be using purple
    const elementsWithPurple = document.querySelectorAll('[style*="7c3aed"], [style*="purple"]');
    elementsWithPurple.forEach(el => {
        const style = el.getAttribute('style');
        if (style) {
            el.setAttribute('style', style.replace(/#7c3aed/g, 'var(--primary-color)'));
        }
    });
}

function renderJobsForPerson(person) {
    // Apply user-specific theme
    applyUserTheme(person);
    
    // Show only jobs assigned to this person, grouped by client
    clientListDiv.innerHTML = '';
    const currentUserDisplay = document.getElementById('currentUserDisplay');
    if (currentUserDisplay) {
        currentUserDisplay.textContent = person ? person : '';
    }
    // Show search bar when a user is selected
    const searchContainer = document.getElementById('searchContainer');
    if (searchContainer) {
        searchContainer.style.display = person ? 'block' : 'none';
    }
    // Refresh allJobs from Firebase to get latest changes
    const jobsRef = ref(database, 'jobCards');
    onValue(jobsRef, (snapshot) => {
        allJobs = [];
        jobKeyMap = {};
        if (snapshot.exists()) {
            const val = snapshot.val();
            for (const [key, job] of Object.entries(val)) {
                allJobs.push({...job, _key: key});
                jobKeyMap[job.id || job.customerCell || key] = key;
            }
        }
        // Now render the filtered jobs for the selected person
        const jobs = allJobs.filter(job => job.assignedTo === person && !isJobInRecycle(job));
        if (jobs.length === 0) {
            if (statusDiv) statusDiv.textContent = `No jobs found for ${person}.`;
            return;
        }
        if (statusDiv) statusDiv.textContent = '';
        const clientMap = groupJobsByClient(jobs);
        renderFilteredClientList(clientMap);
    }, (error) => {
        if (statusDiv) statusDiv.textContent = 'Error loading jobs: ' + error.message;
    });
}

function renderFilteredClientList(clientMap) {
    clientListDiv.innerHTML = '';
    const searchInput = document.getElementById('customerSearchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    
    for (const [client, jobs] of clientMap.entries()) {
        // Filter by search term
        if (searchTerm && !client.toLowerCase().includes(searchTerm)) {
            continue;
        }
        const btn = document.createElement('button');
        btn.className = 'client-name';
        btn.textContent = `${client} (${jobs.length})`;
        btn.onclick = () => openClientModal(client, jobs);
        
        // Only animate if this client hasn't been animated before
        if (!animatedClients.has(client)) {
            animatedClients.add(client);
            btn.style.animation = 'bounceIn 0.6s ease-out';
        } else {
            btn.style.animation = 'none';
        }
        
        clientListDiv.appendChild(btn);
    }
    
    // Force reapply theme to ensure client buttons use correct colors
    if (selectedPerson) {
        applyUserTheme(selectedPerson);
    }
}

// Add search functionality
const customerSearchInput = document.getElementById('customerSearchInput');
if (customerSearchInput) {
    customerSearchInput.addEventListener('input', () => {
        if (selectedPerson) {
            const jobs = allJobs.filter(job => job.assignedTo === selectedPerson && !isJobInRecycle(job));
            const clientMap = groupJobsByClient(jobs);
            renderFilteredClientList(clientMap);
        }
    });
}

// Log modal logic
const openLogBtn = document.getElementById('openLogBtn');
const logModal = document.getElementById('logModal');
const closeLogModalBtn = document.getElementById('closeLogModalBtn');
const logTable = document.getElementById('logTable');
const logStatus = document.getElementById('logStatus');
openLogBtn.addEventListener('click', () => {
    renderLogTable();
    logModal.style.display = 'flex';
});
closeLogModalBtn.addEventListener('click', () => {
    logModal.style.display = 'none';
});
document.body.addEventListener('click', function(e) {
    if (e.target === logModal) {
        logModal.style.display = 'none';
    }
});

// Function to write a log entry to Firebase
function writeLog({user, action, jobName, details}) {
    const logRef = ref(database, 'logs');
    const entry = {
        timestamp: Date.now(),
        user: user || '—',
        action,
        jobName: jobName || '—',
        details: details || ''
    };
    push(logRef, entry);
}

// Function to render the log table
function renderLogTable() {
    const logsRef = ref(database, 'logs');
    logStatus.textContent = 'Loading...';
    onValue(logsRef, (snapshot) => {
        const tbody = logTable.querySelector('tbody');
        tbody.innerHTML = '';
        if (!snapshot.exists()) {
            logStatus.textContent = 'No log entries.';
            return;
        }
        logStatus.textContent = '';
        // Convert to array and sort by timestamp desc
        const logs = Object.values(snapshot.val()).sort((a, b) => b.timestamp - a.timestamp);
        logs.forEach(log => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}</td>
                <td>${log.user || '—'}</td>
                <td>${log.action || '—'}</td>
                <td>${log.jobName || '—'}</td>
                <td>${log.details || '—'}</td>
            `;
            tbody.appendChild(tr);
        });
    }, (error) => {
        logStatus.textContent = 'Error loading log: ' + error.message;
    });
}

// Clear Log File logic
const clearLogBtn = document.getElementById('clearLogBtn');
const clearLogPasswordModal = document.getElementById('clearLogPasswordModal');
const clearLogPasswordInput = document.getElementById('clearLogPasswordInput');
const submitClearLogPassword = document.getElementById('submitClearLogPassword');
const cancelClearLogPassword = document.getElementById('cancelClearLogPassword');
const clearLogPasswordStatus = document.getElementById('clearLogPasswordStatus');

if (clearLogBtn) {
  clearLogBtn.addEventListener('click', () => {
    clearLogPasswordInput.value = '';
    clearLogPasswordStatus.textContent = '';
    clearLogPasswordModal.style.display = 'flex';
    clearLogPasswordInput.focus();
  });
}
if (cancelClearLogPassword) {
  cancelClearLogPassword.addEventListener('click', () => {
    clearLogPasswordModal.style.display = 'none';
  });
}
if (submitClearLogPassword) {
  submitClearLogPassword.addEventListener('click', () => {
    const password = clearLogPasswordInput.value;
    if (password === 'THENETWORKING') {
      set(ref(database, 'logs'), null)
        .then(() => {
          clearLogPasswordStatus.style.color = '#4fc3f7';
          clearLogPasswordStatus.textContent = 'Log file cleared!';
          setTimeout(() => {
            clearLogPasswordModal.style.display = 'none';
            clearLogPasswordStatus.textContent = '';
          }, 1200);
        })
        .catch((err) => {
          clearLogPasswordStatus.style.color = '#b23c3c';
          clearLogPasswordStatus.textContent = 'Error clearing log: ' + err.message;
        });
    } else {
      clearLogPasswordStatus.style.color = '#b23c3c';
      clearLogPasswordStatus.textContent = 'Incorrect password.';
    }
  });
}

// Add edit job modal HTML to the page if not present
if (!document.getElementById('editJobModal')) {
    const editModal = document.createElement('div');
    editModal.className = 'modal';
    editModal.id = 'editJobModal';
    editModal.style.display = 'none';
    editModal.style.alignItems = 'center';
    editModal.style.justifyContent = 'center';
    editModal.style.zIndex = '4000';
    editModal.innerHTML = `
        <div class="a4-modal-content" id="editJobModalContent" style="max-width:600px;width:98vw;position:relative;">
            <button class="close-modal-btn" id="closeEditJobModalBtn" style="top:18px;right:32px;">&times;</button>
            <h2 style="color:#7c3aed;text-align:center;">Edit Job Card</h2>
            <form id="editJobForm">
                <!-- Dynamic form fields will be inserted here -->
            </form>
            <div id="editJobStatus" style="margin-top:10px;color:#e11d48;"></div>
        </div>
    `;
    document.body.appendChild(editModal);
}

// Add send-along modal HTML to the page if not present
if (!document.getElementById('sendAlongModal')) {
    const sendModal = document.createElement('div');
    sendModal.className = 'modal';
    sendModal.id = 'sendAlongModal';
    sendModal.style.display = 'none';
    sendModal.style.alignItems = 'center';
    sendModal.style.justifyContent = 'center';
    sendModal.style.zIndex = '4100';
    sendModal.innerHTML = `
        <div class="a4-modal-content" id="sendAlongModalContent" style="max-width:400px;width:98vw;position:relative;">
            <button class="close-modal-btn" id="closeSendAlongModalBtn" style="top:18px;right:32px;">&times;</button>
            <h2 style="color:#38bdf8;text-align:center;">Send Job Along</h2>
            <form id="sendAlongForm">
                <label for="sendAlongUser">Send to:</label>
                <select id="sendAlongUser" name="sendAlongUser" required style="width:100%;margin-bottom:18px;"></select>
                <button type="submit" class="btn" style="margin-top:10px;">Send</button>
            </form>
            <div id="sendAlongStatus" style="margin-top:10px;color:#e11d48;"></div>
        </div>
    `;
    document.body.appendChild(sendModal);
}

// Popup notification function
function showPopupNotification(message, type = 'default', duration = 3000) {
    const notification = document.createElement('div');
    notification.className = `popup-notification ${type}`;
    notification.textContent = message;
    
    // Add to body
    document.body.appendChild(notification);
    
    // Remove after duration
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 500);
    }, duration);
}

// Welcome back popup system
function checkAndShowWelcomeBack(user) {
    const loginRef = ref(database, 'userLogins/' + user);
    
    onValue(loginRef, (snapshot) => {
        const lastLogin = snapshot.val();
        const now = Date.now();
        const fiveHours = 5 * 60 * 60 * 1000; // 5 hours in milliseconds
        
        if (!lastLogin || (now - lastLogin) > fiveHours) {
            // Determine notification type based on user
            let notificationType = 'default';
            switch(user) {
                case 'Yolandie':
                    notificationType = 'purple';
                    break;
                case 'Francois':
                    notificationType = 'success';
                    break;
                case 'Andre':
                    notificationType = 'gold';
                    break;
                case 'Neil':
                    notificationType = 'teal';
                    break;
            }
            
            // Show welcome back message with user-specific color
            showPopupNotification(`Welcome back, ${user}! 👋`, notificationType, 5000);
            
            // Update last login time in Firebase
            set(loginRef, now);
        }
    }, { once: true }); // Only check once, don't listen for changes
}

// Add event listener for Home button
if (document.getElementById('homeBtn')) {
    document.getElementById('homeBtn').addEventListener('click', function() {
        window.location.href = 'https://thenetwork1ng.github.io/JobApk/';
    });
} 