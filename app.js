// ==========================================
// 1. CONFIGURACIÓN DE FIREBASE
// ==========================================
// ⚠️ REEMPLAZA ESTO CON TUS DATOS DE FIREBASE CONSOLE:
const firebaseConfig = {
    apiKey: "AIzaSyCG0eOcyNdeYYuf91DTghMvns53q1HSBSM",
    authDomain: "Tagendapsicologobetel.firebaseapp.com",
    projectId: "agendapsicologobetel",
    storageBucket: "agendapsicologobetel.firebasestorage.app",
    messagingSenderId: "40123177250",
    appId: "1:40123177250:web:a34875b5a2b8cf95002d7b"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Constante de sesión local (para el login)
const KEY_SESION = 'casaBetelSesionActiva';

// ==========================================
// 2. VERIFICAR SEGURIDAD
// ==========================================
if (localStorage.getItem(KEY_SESION) !== 'true') {
    window.location.href = 'login.html';
}

// ==========================================
// 3. LÓGICA DE NEGOCIO (FECHAS Y ESTADO)
// ==========================================
function calcularProxima(fechaStr) {
    if (!fechaStr) return null;
    const fecha = new Date(fechaStr + 'T00:00:00');
    fecha.setMonth(fecha.getMonth() + 1); // Sumar 1 mes
    return fecha.toISOString().split('T')[0];
}

function obtenerEstado(proximaStr) {
    if (!proximaStr) return { txt: "SIN ATENCIÓN", cls: "" };
    
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const proxima = new Date(proximaStr + 'T00:00:00');
    const diffTime = proxima - hoy;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { txt: `RETARDO (${Math.abs(diffDays)} días)`, cls: 'status-late' };
    if (diffDays <= 7) return { txt: `AVISO (En ${diffDays} días)`, cls: 'status-warning' };
    return { txt: "AL DÍA", cls: 'status-ok' };
}

// ==========================================
// 4. RENDERIZADO (UI) - ASÍNCRONO
// ==========================================
async function actualizarUI() {
    const tbody = document.getElementById('atenciones-listado');
    const select = document.getElementById('paciente-select');
    
    // Mostrar estado de carga
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">Cargando datos desde la nube...</td></tr>';

    try {
        // 1. Obtener datos de Firebase en paralelo
        const [snapPacientes, snapAtenciones] = await Promise.all([
            db.collection('pacientes').get(),
            db.collection('atenciones').get()
        ]);

        const pacientes = snapPacientes.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const atenciones = snapAtenciones.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // 2. Actualizar Select
        select.innerHTML = '<option value="">-- Seleccionar --</option>';
        pacientes.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id; // En Firebase el ID es un string alfanumérico
            opt.textContent = p.nombre;
            select.appendChild(opt);
        });

        // 3. Actualizar Tabla
        tbody.innerHTML = '';
        let alertasCount = 0;

        if (pacientes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">No hay pacientes registrados.</td></tr>';
        } else {
            pacientes.forEach(p => {
                // Filtrar atenciones de este paciente
                const susAtenciones = atenciones.filter(a => a.pacienteId === p.id);
                // Ordenar por fecha
                susAtenciones.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
                
                const ultima = susAtenciones[0];
                const ultimaFecha = ultima ? ultima.fecha : null;
                const proxima = calcularProxima(ultimaFecha);
                const estado = obtenerEstado(proxima);

                if (estado.cls === 'status-late' || estado.cls === 'status-warning') alertasCount++;

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${p.nombre}</strong></td>
                    <td>${ultimaFecha ? `${ultimaFecha} <br><small>${ultima.hora}</small>` : '---'}</td>
                    <td>${proxima || '---'}</td>
                    <td><span class="${estado.cls}">${estado.txt}</span></td>
                    <td><button onclick="borrarPaciente('${p.id}')" style="border-color:red; color:red; padding:5px;">🗑️</button></td>
                `;
                tbody.appendChild(tr);
            });
        }

        // 4. Actualizar Stats
        document.getElementById('stat-pacientes').innerText = pacientes.length;
        document.getElementById('stat-atenciones').innerText = atenciones.length;
        document.getElementById('stat-pendientes').innerText = alertasCount;

    } catch (error) {
        console.error("Error cargando datos:", error);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red">Error de conexión</td></tr>';
    }
}

// ==========================================
// 5. EVENTOS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    actualizarUI(); // Carga inicial

    // Logout
    document.getElementById('logout-button').addEventListener('click', () => {
        localStorage.removeItem(KEY_SESION);
        window.location.href = 'login.html';
    });

    // Nuevo Paciente
    document.getElementById('registro-paciente-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombre = document.getElementById('nuevo-paciente-nombre').value.trim();
        const btn = e.target.querySelector('button');

        if(!nombre) return;

        try {
            btn.disabled = true;
            btn.textContent = "Guardando...";
            
            // Guardar en Firebase (Firestore genera el ID automáticamente)
            await db.collection('pacientes').add({
                nombre: nombre,
                fechaRegistro: new Date().toISOString()
            });

            alert('Paciente guardado en la nube.');
            e.target.reset();
            actualizarUI();
        } catch (error) {
            console.error(error);
            alert("Error al guardar: " + error.message);
        } finally {
            btn.disabled = false;
            btn.textContent = "Agregar Paciente";
        }
    });

    // Nueva Atención
    document.getElementById('registro-atencion-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const pid = document.getElementById('paciente-select').value;
        const fecha = document.getElementById('fecha-atencion').value;
        const hora = document.getElementById('hora-atencion').value;
        const btn = e.target.querySelector('button');

        if(!pid || !fecha || !hora) return alert("Completa todos los campos");

        try {
            btn.disabled = true;
            btn.textContent = "Guardando...";

            await db.collection('atenciones').add({
                pacienteId: pid,
                fecha: fecha,
                hora: hora,
                timestamp: new Date().toISOString()
            });

            alert('Atención registrada correctamente.');
            e.target.reset();
            actualizarUI();
        } catch (error) {
            console.error(error);
            alert("Error: " + error.message);
        } finally {
            btn.disabled = false;
            btn.textContent = "Guardar Atención";
        }
    });
});

// Función Global para borrar
window.borrarPaciente = async function(id) {
    if(!confirm("¿Seguro que deseas eliminar este paciente y TODO su historial de la nube?")) return;
    
    try {
        // 1. Borrar al paciente
        await db.collection('pacientes').doc(id).delete();

        // 2. Borrar sus atenciones (Buscamos y borramos una por una)
        const snapshot = await db.collection('atenciones').where('pacienteId', '==', id).get();
        
        // Creamos un "lote" (batch) para borrar todo junto y ahorrar peticiones
        const batch = db.batch();
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();

        alert("Eliminado correctamente.");
        actualizarUI();

    } catch (error) {
        console.error(error);
        alert("Error al eliminar: " + error.message);
    }
};