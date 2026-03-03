let ready = false;
function showStatus(msg, type) {
    const status = document.getElementById("status");
    status.textContent = msg;
    status.className = "status " + type;
    status.style.display = "block";
}

async function init() {
    try {
        showStatus("⏳ Chargement Face-API...", "loading");
        
        await faceapi.nets.tinyFaceDetector.loadFromUri("https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model");
        await faceapi.nets.faceLandmark68Net.loadFromUri("https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model");
        
        ready = true;
        showStatus("✅ Prêt ! Upload ton selfie !", "success");
    } catch (e) {
        showStatus("❌ Erreur: " + e.message, "error");
    }
}

document.getElementById("imageUpload").addEventListener("change", async function(e) {
    if (!ready) {
        showStatus("⏳ Attends...", "loading");
        return;
    }
    
    const file = e.target.files[0];
    if (!file) return;
    
    showStatus("🔍 Analyse...", "loading");
    
    const img = new Image();
    img.onload = async function() {
        try {
            const detection = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();
            
            if (!detection) {
                showStatus("❌ Pas de visage détecté!", "error");
                return;
            }
            
            document.getElementById("canvasContainer").style.display = "flex";
            
            const c1 = document.getElementById("originalCanvas");
            const ctx1 = c1.getContext("2d");
            c1.width = img.width;
            c1.height = img.height;
            ctx1.drawImage(img, 0, 0);
            
            const c2 = document.getElementById("resultCanvas");
            const ctx2 = c2.getContext("2d");
            c2.width = img.width;
            c2.height = img.height;
            ctx2.drawImage(img, 0, 0);
            
            const mouth = detection.landmarks.getMouth();
            
            ctx2.fillStyle = "rgba(220, 100, 120, 0.5)";
            ctx2.globalCompositeOperation = "multiply";
            ctx2.beginPath();
            mouth.forEach((p, i) => {
                if (i === 0) ctx2.moveTo(p.x, p.y);
                else ctx2.lineTo(p.x, p.y);
            });
            ctx2.closePath();
            ctx2.fill();
            ctx2.globalCompositeOperation = "source-over";
            
            showStatus("✨ Rouge à lèvres appliqué!", "success");
            
        } catch (e) {
            showStatus("❌ Erreur: " + e.message, "error");
        }
    };
    img.src = URL.createObjectURL(file);
});

showStatus("⏳ Initialisation...", "loading");
setTimeout(init, 1000);
