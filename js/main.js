// ============================================================================
// PRE-ENTREGA 10: APIs, PETICIONES Y LIBRERÍAS
// Simulador de Inventario y Cotización — TechCore Hardware & PC
// Integra:
//   1. Peticiones HTTP con fetch() hacia "./data.json" y hacia FakeStore API
//   2. Flujo asíncrono con async / await
//   3. Manejo de errores completo con bloques try / catch / finally
//   4. Librerías externas vía CDN: Toastify JS y SweetAlert2 (cero alerts nativos)
//   5. Renderizado dinámico en el DOM y sincronización con localStorage
// ============================================================================

const TASA_IVA_MEXICO = 0.16;
const PORCENTAJE_CUPON_TECH10 = 0.10;
const RUTA_JSON_LOCAL = "./data.json";
const URL_API_FAKESTORE = "https://fakestoreapi.com/products/category/electronics";
const URL_API_DOLAR = "https://open.er-api.com/v6/latest/USD";
const RUTA_ERROR_SIMULADO = "./endpoint-inexistente-404.json";

const CLAVE_STORAGE_CATALOGO = "techcore_catalogo_hardware_v10";
const CLAVE_STORAGE_CARRITO = "techcore_carrito_cliente_v10";
const CLAVE_STORAGE_CUPON = "techcore_cupon_activo_v10";

let cotizacionDolarActual = 20.15;

// ============================================================================
// 1. CLASE PRINCIPAL DEL MODELO DE DATOS
// ============================================================================

class ProductoHardware {
    constructor({ id, nombre, categoria, precio, stock }) {
        this.id = Number(id);
        this.nombre = nombre;
        this.categoria = categoria || "Hardware";
        this.precio = Number(precio);
        this.stock = Number(stock);
        this.disponible = this.stock > 0;
    }

    vender(cantidadUnidades = 1) {
        if (cantidadUnidades <= 0 || cantidadUnidades > this.stock) {
            return false;
        }
        this.stock -= cantidadUnidades;
        this.disponible = this.stock > 0;
        return true;
    }

    devolverAlStock(cantidadUnidades = 1) {
        this.stock += Number(cantidadUnidades);
        this.disponible = this.stock > 0;
    }

    aplicarDescuento(porcentajeDescuento = 10) {
        if (porcentajeDescuento > 0 && porcentajeDescuento < 100) {
            const factor = 1 - porcentajeDescuento / 100;
            this.precio = Math.round(this.precio * factor * 100) / 100;
        }
        return this.precio;
    }

    calcularPrecioConIva(tasaIva = TASA_IVA_MEXICO) {
        return Math.round(this.precio * (1 + tasaIva) * 100) / 100;
    }
}

// ============================================================================
// 2. GESTIÓN DE PERSISTENCIA EN LOCALSTORAGE
// ============================================================================

function guardarCatalogoEnStorage(listaCatalogo) {
    localStorage.setItem(CLAVE_STORAGE_CATALOGO, JSON.stringify(listaCatalogo));
}

function obtenerCatalogoGuardadoEnStorage() {
    const jsonGuardado = localStorage.getItem(CLAVE_STORAGE_CATALOGO);
    const listaCruda = jsonGuardado ? JSON.parse(jsonGuardado) : null;
    if (!Array.isArray(listaCruda) || listaCruda.length === 0) {
        return null;
    }
    return listaCruda.map((item) => new ProductoHardware(item));
}

function cargarCarritoDesdeStorage() {
    const jsonCarrito = localStorage.getItem(CLAVE_STORAGE_CARRITO);
    const datosParseados = jsonCarrito ? JSON.parse(jsonCarrito) : null;
    return datosParseados ?? [];
}

function guardarCarritoEnStorage(listaCarrito) {
    localStorage.setItem(CLAVE_STORAGE_CARRITO, JSON.stringify(listaCarrito));
}

let catalogoProductosHardware = [];
let carritoCotizacion = cargarCarritoDesdeStorage();
let cuponTech10Activo = localStorage.getItem(CLAVE_STORAGE_CUPON) === "true";
let terminoBusquedaActual = "";
let peticionFetchEnCurso = false;

// ============================================================================
// 3. SELECCIÓN DE ELEMENTOS DEL DOM
// ============================================================================

const avisoTemporizadorDom = document.getElementById("aviso-temporizador");
const tituloAvisoTemporizadorDom = document.getElementById("titulo-aviso-temporizador");
const textoAvisoTemporizadorDom = document.getElementById("texto-aviso-temporizador");
const botonAplicarCuponAviso = document.getElementById("boton-aplicar-cupon-aviso");
const botonCerrarAviso = document.getElementById("boton-cerrar-aviso");

const botonFetchJson = document.getElementById("boton-fetch-json");
const botonFetchApi = document.getElementById("boton-fetch-api");
const botonFetchError = document.getElementById("boton-fetch-error");
const botonRestaurarStorage = document.getElementById("boton-restaurar-storage");

const formularioProducto = document.getElementById("formulario-producto");
const inputNombreProducto = document.getElementById("input-nombre");
const selectCategoriaProducto = document.getElementById("select-categoria");
const inputPrecioProducto = document.getElementById("input-precio");
const inputStockProducto = document.getElementById("input-stock");
const botonAgregarProducto = document.getElementById("boton-agregar");

const inputBusquedaTeclado = document.querySelector("#input-busqueda");
const botonVaciarCarrito = document.querySelector("#boton-vaciar-carrito");
const botonConfirmarCompra = document.getElementById("boton-confirmar-compra");

const contenedorItemsDom = document.getElementById("contenedor-items");
const contenedorCarritoDom = document.getElementById("contenedor-carrito");
const contenedorOrdenConfirmadaDom = document.getElementById("contenedor-orden-confirmada");
const insigniaCuponDom = document.getElementById("insignia-cupon");
const contadorResultadosDom = document.getElementById("contador-resultados");
const etiquetaFuenteDatosDom = document.getElementById("etiqueta-fuente-datos");

const bannerFeedbackDom = document.getElementById("mensaje-feedback");
const textoFeedbackDom = document.getElementById("texto-feedback");
const estadoFinallyDom = document.getElementById("estado-finally");

const metricaTotalModelos = document.getElementById("metrica-total-modelos");
const metricaValorInventario = document.getElementById("metrica-valor-inventario");
const metricaUnidadesCotizadas = document.getElementById("metrica-unidades-cotizadas");
const metricaTotalCotizado = document.getElementById("metrica-total-cotizado");

// ============================================================================
// 4. INTEGRACIÓN DE LIBRERÍAS EXTERNAS (Toastify JS + SweetAlert2)
// Reemplazo total de alert(), confirm() y prompt() nativos
// ============================================================================

const formatearMonedaMxn = (monto) => `$${Number(monto || 0).toLocaleString("es-MX")} MXN`;

function obtenerHoraActualFormateada() {
    return new Date().toLocaleTimeString("es-MX", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

/**
 * Muestra una notificación tipo Toast empleando la librería Toastify JS
 */
function notificarConToastify(mensaje, tipo = "exito") {
    if (typeof Toastify !== "function") {
        return;
    }

    const coloresPorTipo = {
        exito: "linear-gradient(135deg, #059669, #10b981)",
        info: "linear-gradient(135deg, #0284c7, #38bdf8)",
        alerta: "linear-gradient(135deg, #d97706, #f59e0b)",
        error: "linear-gradient(135deg, #dc2626, #ef4444)"
    };

    Toastify({
        text: mensaje,
        duration: 3200,
        gravity: "bottom",
        position: "right",
        stopOnFocus: true,
        style: {
            background: coloresPorTipo[tipo] || coloresPorTipo.info,
            borderRadius: "10px",
            fontWeight: "600",
            boxShadow: "0 10px 25px rgba(0, 0, 0, 0.35)"
        }
    }).showToast();
}

/**
 * Muestra un modal estilizado empleando la librería SweetAlert2
 */
function mostrarAlertaSweetAlert({ titulo, texto, icono = "info", html = "" }) {
    if (typeof Swal === "undefined") {
        return;
    }

    const opciones = {
        title: titulo,
        icon: icono,
        background: "#131b2e",
        color: "#f1f5f9",
        confirmButtonColor: "#38bdf8",
        confirmButtonText: "Entendido"
    };

    if (html) {
        opciones.html = html;
    } else {
        opciones.text = texto;
    }

    Swal.fire(opciones);
}

function mostrarFeedbackBanner(mensajeTexto, tipoEstado = "exito", textoFinally = "") {
    const claseEstado =
        tipoEstado === "cargando"
            ? "feedback-cargando"
            : tipoEstado === "exito"
            ? "feedback-exito"
            : tipoEstado === "alerta"
            ? "feedback-alerta"
            : "feedback-eliminado";

    textoFeedbackDom.textContent = mensajeTexto;
    bannerFeedbackDom.className = `banner-feedback ${claseEstado}`;

    if (textoFinally) {
        estadoFinallyDom.textContent = textoFinally;
    }
}

function actualizarEstadoBotonesFetch(deshabilitar) {
    peticionFetchEnCurso = deshabilitar;
    botonFetchJson.disabled = deshabilitar;
    botonFetchApi.disabled = deshabilitar;
    botonFetchError.disabled = deshabilitar;
    botonConfirmarCompra.disabled = deshabilitar;
}

// ============================================================================
// 5. PETICIONES ASÍNCRONAS CON FETCH + ASYNC/AWAIT + TRY/CATCH/FINALLY
// ============================================================================

/**
 * Normaliza los objetos recibidos ya sea desde ./data.json o desde FakeStore API
 * para convertirlos en instancias de ProductoHardware.
 */
function transformarDatosEnProductosHardware(datosCrudos) {
    return datosCrudos.map((item, indice) => {
        // Si proviene de FakeStore API, tiene propiedades title, price (en USD) y rating.count
        if (item.title && item.price !== undefined && item.nombre === undefined) {
            const precioEnMxn = Math.round(Number(item.price) * cotizacionDolarActual);
            const stockEstimado = item.rating?.count ? Math.min(Number(item.rating.count), 25) : 8;
            return new ProductoHardware({
                id: item.id ?? indice + 1,
                nombre: item.title,
                categoria: "Electrónica API",
                precio: precioEnMxn,
                stock: stockEstimado
            });
        }

        // Si proviene de ./data.json local
        return new ProductoHardware({
            id: item.id ?? indice + 1,
            nombre: item.nombre,
            categoria: item.categoria ?? "Hardware",
            precio: item.precio,
            stock: item.stock
        });
    });
}

/**
 * Solicita el catálogo mediante fetch() con async/await y manejo de errores try/catch/finally.
 * @param {string} urlEndpoint - Ruta del archivo JSON local ("./data.json") o URL de API externa
 * @param {string} nombreFuente - Etiqueta descriptiva de la fuente consultada
 */
async function cargarProductosConFetch(urlEndpoint = RUTA_JSON_LOCAL, nombreFuente = "./data.json") {
    if (peticionFetchEnCurso) {
        return;
    }

    actualizarEstadoBotonesFetch(true);
    etiquetaFuenteDatosDom.textContent = nombreFuente;
    contadorResultadosDom.textContent = "⏳ Cargando productos…";

    mostrarFeedbackBanner(
        `⏳ Solicitando productos mediante fetch("${urlEndpoint}")...`,
        "cargando",
        "Petición HTTP en curso..."
    );

    contenedorItemsDom.innerHTML = `
        <div class="estado-carga-promesa">
            <h3>⏳ Cargando productos…</h3>
            <p>Esperando respuesta asíncrona de <code>fetch("${urlEndpoint}")</code> con <code>async/await</code>.</p>
        </div>
    `;

    try {
        const respuestaHttp = await fetch(urlEndpoint);

        // Verificar que el código de estado HTTP sea exitoso (200-299)
        if (!respuestaHttp.ok) {
            throw new Error(
                `Error HTTP ${respuestaHttp.status} (${respuestaHttp.statusText || "Recurso no encontrado"}) al consultar ${urlEndpoint}`
            );
        }

        const datosJson = await respuestaHttp.json();

        if (!Array.isArray(datosJson) || datosJson.length === 0) {
            throw new Error("El origen de datos devolvió una lista vacía o con formato inválido.");
        }

        catalogoProductosHardware = transformarDatosEnProductosHardware(datosJson);
        guardarCatalogoEnStorage(catalogoProductosHardware);

        renderizarInterfazCompleta();

        mostrarFeedbackBanner(
            `✅ ${catalogoProductosHardware.length} productos cargados con éxito desde ${nombreFuente}.`,
            "exito"
        );

        notificarConToastify(
            `✅ Productos cargados con éxito (${catalogoProductosHardware.length} ítems desde ${nombreFuente})`,
            "exito"
        );
    } catch (errorFetch) {
        contadorResultadosDom.textContent = "❌ Error en la petición fetch";

        // Si existen productos previos en memoria o en localStorage los conservamos para no romper la experiencia
        const respaldoStorage = obtenerCatalogoGuardadoEnStorage();
        if (catalogoProductosHardware.length === 0 && respaldoStorage) {
            catalogoProductosHardware = respaldoStorage;
        }

        if (catalogoProductosHardware.length > 0) {
            renderizarInterfazCompleta();
        } else {
            contenedorItemsDom.innerHTML = `
                <div class="estado-vacio">
                    <h3>❌ No se pudieron obtener los datos remotos</h3>
                    <p>${errorFetch.message}</p>
                    <p>Haz clic en "📥 Fetch ./data.json" o "🌐 Fetch FakeStore API" para volver a intentar.</p>
                </div>
            `;
        }

        mostrarFeedbackBanner(
            `❌ Falló la petición fetch: ${errorFetch.message}`,
            "eliminado"
        );

        // Notificación de error con las librerías Toastify y SweetAlert2 (nunca alert nativo)
        notificarConToastify(`❌ Error en fetch: ${errorFetch.message}`, "error");

        mostrarAlertaSweetAlert({
            titulo: "No se pudo completar la petición Fetch",
            texto: `Detalle técnico capturado en el bloque catch: ${errorFetch.message}`,
            icono: "error"
        });
    } finally {
        // El bloque finally se ejecuta siempre al terminar la promesa de fetch
        actualizarEstadoBotonesFetch(false);
        estadoFinallyDom.textContent = `✔️ finally ejecutado (${obtenerHoraActualFormateada()})`;
    }
}

/**
 * Consulta la cotización real del dólar desde una API pública mediante fetch() + try/catch/finally
 * y la muestra unos segundos después de ingresar al simulador.
 */
async function consultarCotizacionDolarConFetch() {
    try {
        const respuesta = await fetch(URL_API_DOLAR);
        if (!respuesta.ok) {
            throw new Error(`HTTP ${respuesta.status}`);
        }
        const datos = await respuesta.json();
        const tasaMxn = Number(datos?.rates?.MXN);
        if (tasaMxn > 0) {
            cotizacionDolarActual = Number(tasaMxn.toFixed(2));
        }
    } catch (errorDolar) {
        // Si no hay internet o falla la API externa de divisas, usamos el valor de referencia ($20.15 MXN)
        cotizacionDolarActual = 20.15;
    } finally {
        setTimeout(() => {
            tituloAvisoTemporizadorDom.textContent = `Cotización del dólar hoy (API): $${cotizacionDolarActual} MXN`;
            textoAvisoTemporizadorDom.textContent = cuponTech10Activo
                ? "El cupón TECH10 (-10% adicional en tu carrito) ya está activo en tu sesión."
                : "Activa el cupón TECH10 para obtener un 10% de descuento directo en tu carrito.";

            if (cuponTech10Activo) {
                botonAplicarCuponAviso.textContent = "Cupón TECH10 Activo ✔️";
                botonAplicarCuponAviso.disabled = true;
            }

            avisoTemporizadorDom.classList.remove("oculto");
            renderizarInterfazCompleta();
        }, 1800);
    }
}

// ============================================================================
// 6. CÁLCULO DE MÉTRICAS Y RENDERIZADO DINÁMICO EN EL DOM
// ============================================================================

function calcularTotalesCarrito() {
    const totalUnidadesCarrito = carritoCotizacion.reduce(
        (acumulador, { cantidad }) => acumulador + cantidad,
        0
    );

    const subtotalConIva = carritoCotizacion.reduce(
        (acumulador, { precioConIva, cantidad }) =>
            Math.round((acumulador + precioConIva * cantidad) * 100) / 100,
        0
    );

    const factorDescuento = cuponTech10Activo ? 1 - PORCENTAJE_CUPON_TECH10 : 1;
    const totalConDescuento = Math.round(subtotalConIva * factorDescuento * 100) / 100;

    return {
        totalUnidadesCarrito,
        subtotalConIva,
        totalConDescuento
    };
}

function actualizarMetricasSincronizadas() {
    const totalModelos = catalogoProductosHardware.length;

    const valorTotalInventario = catalogoProductosHardware.reduce(
        (acumulador, { precio, stock }) => acumulador + precio * stock,
        0
    );

    const { totalUnidadesCarrito, totalConDescuento } = calcularTotalesCarrito();

    metricaTotalModelos.textContent = totalModelos;
    metricaValorInventario.textContent = formatearMonedaMxn(valorTotalInventario);
    metricaUnidadesCotizadas.textContent = totalUnidadesCarrito;
    metricaTotalCotizado.textContent = formatearMonedaMxn(totalConDescuento);

    if (cuponTech10Activo) {
        insigniaCuponDom.classList.remove("oculto");
    } else {
        insigniaCuponDom.classList.add("oculto");
    }
}

function obtenerProductosFiltrados(terminoFiltro) {
    const terminoLimpio = (terminoFiltro || "").trim().toLowerCase();

    return terminoLimpio === ""
        ? catalogoProductosHardware
        : catalogoProductosHardware.filter(
              ({ nombre, categoria }) =>
                  nombre.toLowerCase().includes(terminoLimpio) ||
                  categoria.toLowerCase().includes(terminoLimpio)
          );
}

function renderizarCarritoDom() {
    if (carritoCotizacion.length === 0) {
        contenedorCarritoDom.innerHTML = `
            <div class="estado-vacio">
                <p>No hay productos en el carrito.</p>
            </div>
        `;
        return;
    }

    const htmlCarrito = carritoCotizacion
        .map(({ id, nombre, cantidad, precioConIva }) => {
            const subtotalItem = Math.round(cantidad * precioConIva * 100) / 100;
            return `
                <div class="item-carrito">
                    <div class="info-item-carrito">
                        <h4>${cantidad}x ${nombre}</h4>
                        <p>${formatearMonedaMxn(subtotalItem)} (IVA incl.)</p>
                    </div>
                    <button
                        type="button"
                        class="boton-quitar-carrito"
                        data-accion-carrito="quitar"
                        data-id="${id}"
                    >
                        Quitar
                    </button>
                </div>
            `;
        })
        .join("");

    contenedorCarritoDom.innerHTML = htmlCarrito;
}

function renderizarInterfazCompleta() {
    const listaFiltrada = obtenerProductosFiltrados(terminoBusquedaActual);

    contadorResultadosDom.textContent =
        listaFiltrada.length === 1
            ? "✔️ 1 producto disponible"
            : `✔️ ${listaFiltrada.length} productos disponibles`;

    if (listaFiltrada.length === 0) {
        contenedorItemsDom.innerHTML = `
            <div class="estado-vacio">
                <h3>Sin coincidencias</h3>
                <p>No se encontraron componentes para "${terminoBusquedaActual}". Presiona Esc para ver todos.</p>
            </div>
        `;
    } else {
        const htmlTarjetas = listaFiltrada
            .map((producto) => {
                const { id, nombre, categoria, precio, stock } = producto;
                const precioConIva = producto.calcularPrecioConIva();
                const equivalenteUsd = (precio / cotizacionDolarActual).toFixed(0);

                const claseTarjeta = stock === 0 ? "tarjeta-item sin-stock" : "tarjeta-item";
                const etiquetaStock =
                    stock > 0
                        ? `Stock disponible: <strong>${stock}</strong> unidad(es)`
                        : `<span class="stock-agotado">AGOTADO (0 unidades)</span>`;
                const atributoDisabled = stock === 0 ? "disabled" : "";

                return `
                    <article class="${claseTarjeta}" data-id="${id}">
                        <div class="cabecera-item">
                            <span class="etiqueta-categoria">${categoria}</span>
                            <span class="id-item">ID #${id} · ~${equivalenteUsd} USD</span>
                        </div>
                        <h3 class="titulo-item">${nombre}</h3>
                        <p class="precio-item">${formatearMonedaMxn(precio)}</p>
                        <p class="precio-iva">Con IVA (16%): ${formatearMonedaMxn(precioConIva)}</p>
                        <p class="stock-item">${etiquetaStock}</p>
                        <div class="acciones-item">
                            <button
                                type="button"
                                class="boton-cotizar"
                                data-accion="cotizar"
                                data-id="${id}"
                                ${atributoDisabled}
                            >
                                + Al Carrito
                            </button>
                            <button
                                type="button"
                                class="boton-descuento"
                                data-accion="descuento"
                                data-id="${id}"
                                title="Aplicar 10% de descuento directo al componente"
                            >
                                -10%
                            </button>
                            <button
                                type="button"
                                class="boton-eliminar"
                                data-accion="eliminar"
                                data-id="${id}"
                            >
                                Eliminar
                            </button>
                        </div>
                    </article>
                `;
            })
            .join("");

        contenedorItemsDom.innerHTML = htmlTarjetas;
    }

    renderizarCarritoDom();
    actualizarMetricasSincronizadas();
}

// ============================================================================
// 7. INTERACCIONES DEL USUARIO CON LIBRERÍAS Y MANEJO DE ERRORES
// ============================================================================

function obtenerSiguienteIdDisponible() {
    return (
        catalogoProductosHardware.reduce(
            (maximoId, { id }) => (id > maximoId ? id : maximoId),
            0
        ) + 1
    );
}

function agregarProductoAlCatalogo() {
    try {
        const nombreIngresado = inputNombreProducto.value.trim();
        const categoriaSeleccionada = selectCategoriaProducto.value || "Hardware";
        const precioIngresado = parseFloat(inputPrecioProducto.value);
        const stockIngresado = parseInt(inputStockProducto.value, 10);

        if (nombreIngresado === "") {
            inputNombreProducto.focus();
            throw new Error("Ingresá el nombre del componente antes de agregarlo.");
        }

        if (isNaN(precioIngresado) || precioIngresado <= 0) {
            inputPrecioProducto.focus();
            throw new Error("Ingresá un precio válido mayor a $0 MXN.");
        }

        if (isNaN(stockIngresado) || stockIngresado < 1) {
            inputStockProducto.focus();
            throw new Error("El stock inicial debe ser de al menos 1 unidad.");
        }

        const nuevoProducto = new ProductoHardware({
            id: obtenerSiguienteIdDisponible(),
            nombre: nombreIngresado,
            categoria: categoriaSeleccionada,
            precio: precioIngresado,
            stock: stockIngresado
        });

        catalogoProductosHardware.push(nuevoProducto);
        guardarCatalogoEnStorage(catalogoProductosHardware);

        inputNombreProducto.value = "";
        inputPrecioProducto.value = "";
        inputStockProducto.value = "5";
        inputNombreProducto.focus();

        renderizarInterfazCompleta();
        mostrarFeedbackBanner(
            `✅ Componente agregado: "${nuevoProducto.nombre}" (${formatearMonedaMxn(nuevoProducto.precio)}).`,
            "exito"
        );
        notificarConToastify(`✅ Agregado: ${nuevoProducto.nombre}`, "exito");
    } catch (errorValidacion) {
        mostrarFeedbackBanner(`⚠️ ${errorValidacion.message}`, "alerta");
        notificarConToastify(`⚠️ ${errorValidacion.message}`, "alerta");
    } finally {
        estadoFinallyDom.textContent = `✔️ finally formulario (${obtenerHoraActualFormateada()})`;
    }
}

function gestionarAccionTarjetaCatalogo(idProducto, accion) {
    const indiceProducto = catalogoProductosHardware.findIndex(({ id }) => id === idProducto);
    if (indiceProducto === -1) {
        return;
    }

    const productoObjetivo = catalogoProductosHardware[indiceProducto];
    const { id, nombre } = productoObjetivo;

    if (accion === "cotizar") {
        const ventaExitosa = productoObjetivo.vender(1);
        if (!ventaExitosa) {
            notificarConToastify("⚠️ Sin stock disponible para este componente", "alerta");
            return;
        }

        const itemExistente = carritoCotizacion.find((item) => item.id === id);
        if (itemExistente) {
            itemExistente.cantidad += 1;
            itemExistente.precioConIva = productoObjetivo.calcularPrecioConIva();
        } else {
            carritoCotizacion.push({
                id,
                nombre,
                cantidad: 1,
                precioConIva: productoObjetivo.calcularPrecioConIva()
            });
        }

        contenedorOrdenConfirmadaDom.classList.add("oculto");
        guardarCatalogoEnStorage(catalogoProductosHardware);
        guardarCarritoEnStorage(carritoCotizacion);
        renderizarInterfazCompleta();

        mostrarFeedbackBanner(
            `✅ +1x "${nombre}" agregado al carrito (Stock restante: ${productoObjetivo.stock}).`,
            "exito"
        );
        notificarConToastify(`🛒 +1 ${nombre} al carrito`, "exito");
    } else if (accion === "descuento") {
        const precioPrevio = productoObjetivo.precio;
        const nuevoPrecio = productoObjetivo.aplicarDescuento(10);

        const itemEnCarrito = carritoCotizacion.find((item) => item.id === id);
        if (itemEnCarrito?.id) {
            itemEnCarrito.precioConIva = productoObjetivo.calcularPrecioConIva();
            guardarCarritoEnStorage(carritoCotizacion);
        }

        guardarCatalogoEnStorage(catalogoProductosHardware);
        renderizarInterfazCompleta();

        mostrarFeedbackBanner(
            `✅ Descuento del 10% aplicado a "${nombre}": ${formatearMonedaMxn(precioPrevio)} -> ${formatearMonedaMxn(nuevoPrecio)}.`,
            "exito"
        );
        notificarConToastify(`🏷️ -10% aplicado en ${nombre}`, "info");
    } else if (accion === "eliminar") {
        catalogoProductosHardware.splice(indiceProducto, 1);
        carritoCotizacion = carritoCotizacion.filter((item) => item.id !== id);

        guardarCatalogoEnStorage(catalogoProductosHardware);
        guardarCarritoEnStorage(carritoCotizacion);
        renderizarInterfazCompleta();

        mostrarFeedbackBanner(`🗑️ Componente eliminado del catálogo: "${nombre}".`, "eliminado");
        notificarConToastify(`🗑️ Eliminado: ${nombre}`, "error");
    }
}

function quitarItemDelCarritoStorage(idProducto) {
    const indiceEnCarrito = carritoCotizacion.findIndex(({ id }) => id === idProducto);
    if (indiceEnCarrito === -1) {
        return;
    }

    const { nombre, cantidad } = carritoCotizacion[indiceEnCarrito];
    const productoEnCatalogo = catalogoProductosHardware.find(({ id }) => id === idProducto);

    productoEnCatalogo?.devolverAlStock(cantidad);
    carritoCotizacion.splice(indiceEnCarrito, 1);

    guardarCatalogoEnStorage(catalogoProductosHardware);
    guardarCarritoEnStorage(carritoCotizacion);
    renderizarInterfazCompleta();

    mostrarFeedbackBanner(`Se quitó "${nombre}" del carrito y se restauró su stock.`, "alerta");
    notificarConToastify(`↩️ ${nombre} devuelto al stock`, "alerta");
}

async function confirmarCompraConSweetAlert() {
    if (carritoCotizacion.length === 0) {
        notificarConToastify("⚠️ Tu carrito está vacío. Agregá productos antes de confirmar.", "alerta");
        mostrarAlertaSweetAlert({
            titulo: "Carrito vacío",
            texto: "Agregá al menos un componente de hardware al carrito para procesar tu orden.",
            icono: "warning"
        });
        return;
    }

    const { totalUnidadesCarrito, totalConDescuento } = calcularTotalesCarrito();
    const folioGenerado = `TC-${Math.floor(100000 + Math.random() * 900000)}`;
    const fechaConfirmacion = obtenerHoraActualFormateada();

    carritoCotizacion = [];
    guardarCarritoEnStorage(carritoCotizacion);
    renderizarInterfazCompleta();

    contenedorOrdenConfirmadaDom.innerHTML = `
        <h4>✔️ Orden Confirmada #${folioGenerado}</h4>
        <p>Unidades adquiridas: <strong>${totalUnidadesCarrito}</strong></p>
        <p>Total pagado: <strong>${formatearMonedaMxn(totalConDescuento)}</strong></p>
        <p>Hora: ${fechaConfirmacion}</p>
    `;
    contenedorOrdenConfirmadaDom.classList.remove("oculto");

    mostrarFeedbackBanner(
        `✅ Compra confirmada con éxito. Folio de seguimiento: ${folioGenerado}.`,
        "exito",
        `✔️ Checkout completado (${fechaConfirmacion})`
    );

    notificarConToastify(`✅ Orden ${folioGenerado} procesada con éxito`, "exito");

    mostrarAlertaSweetAlert({
        titulo: "¡Compra Confirmada!",
        icono: "success",
        html: `
            <p>Tu pedido fue procesado correctamente.</p>
            <p style="margin-top:0.5rem;"><strong>Folio:</strong> ${folioGenerado}</p>
            <p><strong>Unidades:</strong> ${totalUnidadesCarrito}</p>
            <p><strong>Total (IVA incl.):</strong> ${formatearMonedaMxn(totalConDescuento)}</p>
        `
    });
}

// ============================================================================
// 8. REGISTRO DE EVENTOS DEL DOM
// ============================================================================

botonAgregarProducto.addEventListener("click", () => {
    agregarProductoAlCatalogo();
});

formularioProducto.addEventListener("submit", (evento) => {
    evento.preventDefault();
    agregarProductoAlCatalogo();
});

// Botón 1: Petición fetch al archivo ./data.json local
botonFetchJson.addEventListener("click", () => {
    cargarProductosConFetch(RUTA_JSON_LOCAL, "./data.json");
});

// Botón 2: Petición fetch a la API externa FakeStore (categoría electrónica)
botonFetchApi.addEventListener("click", () => {
    cargarProductosConFetch(URL_API_FAKESTORE, "FakeStore API");
});

// Botón 3: Simulación de fallo de red / 404 para probar el bloque catch y SweetAlert2
botonFetchError.addEventListener("click", () => {
    cargarProductosConFetch(RUTA_ERROR_SIMULADO, "Endpoint 404 (Prueba catch)");
});

botonConfirmarCompra.addEventListener("click", () => {
    confirmarCompraConSweetAlert();
});

botonAplicarCuponAviso.addEventListener("click", () => {
    cuponTech10Activo = true;
    localStorage.setItem(CLAVE_STORAGE_CUPON, "true");
    botonAplicarCuponAviso.textContent = "Cupón TECH10 Activo ✔️";
    botonAplicarCuponAviso.disabled = true;
    textoAvisoTemporizadorDom.textContent =
        "¡Cupón TECH10 activado! Se aplicó un 10% de descuento sobre el total de tu carrito.";

    actualizarMetricasSincronizadas();
    notificarConToastify("🎁 Cupón TECH10 (-10%) activado", "exito");
});

botonCerrarAviso.addEventListener("click", () => {
    avisoTemporizadorDom.classList.add("oculto");
});

contenedorItemsDom.addEventListener("click", (evento) => {
    const botonAccion = evento.target.closest("button[data-accion]");
    const idProducto = Number(botonAccion?.dataset?.id ?? 0);
    const accion = botonAccion?.dataset?.accion ?? "";

    if (idProducto > 0 && accion !== "") {
        gestionarAccionTarjetaCatalogo(idProducto, accion);
    }
});

contenedorCarritoDom.addEventListener("click", (evento) => {
    const botonQuitar = evento.target.closest("button[data-accion-carrito='quitar']");
    const idProducto = Number(botonQuitar?.dataset?.id ?? 0);

    if (idProducto > 0) {
        quitarItemDelCarritoStorage(idProducto);
    }
});

inputBusquedaTeclado.addEventListener("keyup", (evento) => {
    if (evento.key === "Escape") {
        inputBusquedaTeclado.value = "";
        terminoBusquedaActual = "";
        renderizarInterfazCompleta();
        notificarConToastify("Filtro de búsqueda limpiado", "info");
        return;
    }

    terminoBusquedaActual = evento.target.value ?? "";
    renderizarInterfazCompleta();
});

botonVaciarCarrito.addEventListener("click", () => {
    if (carritoCotizacion.length === 0) {
        notificarConToastify("⚠️ El carrito ya está vacío", "alerta");
        return;
    }

    carritoCotizacion.forEach(({ id, cantidad }) => {
        const producto = catalogoProductosHardware.find((item) => item.id === id);
        producto?.devolverAlStock(cantidad);
    });

    carritoCotizacion = [];
    localStorage.removeItem(CLAVE_STORAGE_CARRITO);
    guardarCatalogoEnStorage(catalogoProductosHardware);
    renderizarInterfazCompleta();

    mostrarFeedbackBanner("Carrito vaciado y stock devuelto al inventario.", "alerta");
    notificarConToastify("🧹 Carrito vaciado correctamente", "alerta");
});

botonRestaurarStorage.addEventListener("click", () => {
    localStorage.removeItem(CLAVE_STORAGE_CATALOGO);
    localStorage.removeItem(CLAVE_STORAGE_CARRITO);
    localStorage.removeItem(CLAVE_STORAGE_CUPON);

    cuponTech10Activo = false;
    carritoCotizacion = [];
    terminoBusquedaActual = "";
    inputBusquedaTeclado.value = "";
    contenedorOrdenConfirmadaDom.classList.add("oculto");

    botonAplicarCuponAviso.textContent = "Activar Cupón TECH10 (-10%)";
    botonAplicarCuponAviso.disabled = false;

    cargarProductosConFetch(RUTA_JSON_LOCAL, "./data.json");
});

// ============================================================================
// 9. INICIALIZACIÓN AL CARGAR LA PÁGINA (fetch a ./data.json y API de divisas)
// ============================================================================

consultarCotizacionDolarConFetch();
cargarProductosConFetch(RUTA_JSON_LOCAL, "./data.json");
