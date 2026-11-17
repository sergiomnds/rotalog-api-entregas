const RAIO_TERRA_KM = 6371;
const MINUTOS_POR_KM = 2;

function paraRadianos(graus) {
    return (graus * Math.PI) / 180;
}

function calcularDistanciaKm(origem, destino) {
    const dLat = paraRadianos(destino.lat - origem.lat);
    const dLng = paraRadianos(destino.lng - origem.lng);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(paraRadianos(origem.lat)) * Math.cos(paraRadianos(destino.lat)) * Math.sin(dLng / 2) ** 2;
    return RAIO_TERRA_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimarTempoMinutos(distanciaKm) {
    if (distanciaKm === null || distanciaKm === undefined) return null;
    return Math.ceil(distanciaKm * MINUTOS_POR_KM);
}

module.exports = { calcularDistanciaKm, estimarTempoMinutos, RAIO_TERRA_KM, MINUTOS_POR_KM };
