let currentResult = null;

document.getElementById("hesaplaBtn").addEventListener("click", async () => {
  const loading = document.getElementById("loading");
  const error = document.getElementById("error");
  const result = document.getElementById("result");
  const kopyalaBtn = document.getElementById("kopyalaBtn");
  const copySuccess = document.getElementById("copySuccess");

  loading.style.display = "block";
  error.style.display = "none";
  result.style.display = "none";
  copySuccess.style.display = "none";
  document.getElementById("hesaplaBtn").disabled = true;
  kopyalaBtn.disabled = true;

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    const response = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: hesaplaCalismaSuresi,
    });

    currentResult = response[0].result;
    sonucuGoster(currentResult);
    kopyalaBtn.disabled = false;
  } catch (err) {
    error.textContent = "Hata: " + err.message;
    error.style.display = "block";
  } finally {
    loading.style.display = "none";
    document.getElementById("hesaplaBtn").disabled = false;
  }
});

document.getElementById("kopyalaBtn").addEventListener("click", async () => {
  if (!currentResult) return;

  try {
    const metin = sonucuMetneCevir(currentResult);
    await navigator.clipboard.writeText(metin);

    const copySuccess = document.getElementById("copySuccess");
    copySuccess.style.display = "block";

    // 2 saniye sonra gizle
    setTimeout(() => {
      copySuccess.style.display = "none";
    }, 2000);
  } catch (err) {
    console.error("Kopyalama hatası:", err);
  }
});

function sonucuGoster(sonuc) {
  const resultDiv = document.getElementById("result");
  const errorDiv = document.getElementById("error");

  if (sonuc.error) {
    errorDiv.textContent = sonuc.error;
    errorDiv.style.display = "block";
    return;
  }

  if (sonuc.sessions.length === 0) {
    resultDiv.innerHTML =
      '<div class="no-data">Henüz çalışma verisi bulunamadı</div>';
    resultDiv.style.display = "block";
    return;
  }

  let html = `
        <div class="total">
            Toplam çalışma süresi: ${dakikayiSaatDakikaYap(sonuc.toplamDakika)}
        </div>
    `;

  sonuc.sessions.forEach((session, index) => {
    html += `
            <div class="session">
                <div class="session-header">
                    ${index + 1}. Çalışma Periyodu
                </div>
                <div class="session-time">
                    ${session.baslangicTarih} ${session.baslangicSaat} - ${
      session.bitisTarih
    } ${session.bitisSaat}
                </div>
                <div class="session-duration">
                    Süre: ${dakikayiSaatDakikaYap(session.sureDakika)}
                </div>
                <div class="session-time">
                    ${session.fromList} → ${session.toList}
                </div>
            </div>
        `;
  });

  resultDiv.innerHTML = html;
  resultDiv.style.display = "block";
}

function sonucuMetneCevir(sonuc) {
  if (!sonuc || sonuc.sessions.length === 0) {
    return "Henüz çalışma verisi bulunamadı";
  }

  let metin = `## Toplam Kart Çalışma Süresi\n`;
  metin += `**${dakikayiSaatDakikaYap(sonuc.toplamDakika)}**\n\n`;

  sonuc.sessions.forEach((session, index) => {
    metin += `### ${index + 1}. Çalışma Periyodu\n`;
    metin += `- **Tarih:** ${session.baslangicTarih}\n`;
    metin += `- **Başlangıç:** ${session.baslangicSaat.replace(".", ":")}\n`;
    metin += `- **Bitiş:** ${session.bitisSaat.replace(".", ":")}\n`;
    metin += `- **Süre:** ${dakikayiSaatDakikaYap(session.sureDakika)}\n\n`;
  });

  return metin;
}

// Dakikayı saat ve dakika formatına çevir
function dakikayiSaatDakikaYap(dakika) {
  if (!dakika || dakika <= 0) return "0 dakika";

  const saat = Math.floor(dakika / 60);
  const kalanDakika = dakika % 60;

  if (saat > 0 && kalanDakika > 0) {
    return `${saat} saat ${kalanDakika} dakika`;
  } else if (saat > 0) {
    return `${saat} saat`;
  } else {
    return `${kalanDakika} dakika`;
  }
}

// Content script'te çalışacak fonksiyon
function hesaplaCalismaSuresi() {
  try {
    console.log("Süre hesaplama başlatıldı...");

    // Tüm hareketleri bul ve parse et
    const hareketler = tumHareketleriBulVeParseEt();
    console.log("Tüm hareketler:", hareketler);

    if (hareketler.length === 0) {
      return { sessions: [], toplamDakika: 0, toplamHareket: 0 };
    }

    const sessions = calismaSessionslariniHesapla(hareketler);
    console.log("Hesaplanan sessions:", sessions);

    const toplamSure = sessions.reduce(
      (toplam, session) => toplam + session.sure,
      0
    );
    const toplamDakika = Math.round(toplamSure / (1000 * 60));

    return {
      sessions: sessions,
      toplamDakika: toplamDakika,
      toplamHareket: hareketler.length,
    };
  } catch (error) {
    console.error("Hesaplama hatası:", error);
    return { error: error.message, sessions: [] };
  }

  function tumHareketleriBulVeParseEt() {
    const hareketler = [];

    // Tüm aktivite elementlerini bul
    const aktiviteElementleri = document.querySelectorAll(
      '[data-testid="card-back-action"]'
    );

    console.log("Toplam aktivite elementi:", aktiviteElementleri.length);

    aktiviteElementleri.forEach((element, index) => {
      const text = element.textContent || "";

      console.log(`\n--- Aktivite ${index + 1} ---`);
      console.log("Original:", text);

      let hareket = null;

      // "taşıdı" aktiviteleri
      if (
        text.includes("listesinden") &&
        text.includes("listesine") &&
        text.includes("taşıdı")
      ) {
        hareket = hareketiParseEt(text, element, "move");
      }
      // "ekledi" aktiviteleri (kart direkt listede oluşturuldu)
      else if (text.includes("listesine") && text.includes("ekledi")) {
        hareket = hareketiParseEt(text, element, "create");
      }

      console.log("Parse sonucu:", hareket);

      if (hareket && hareket.tarih) {
        hareketler.push(hareket);
      }
    });

    console.log("Toplam hareket:", hareketler.length);
    // Tarihe göre sırala (eskiden yeniye)
    return hareketler.sort((a, b) => a.tarih - b.tarih);
  }

  function hareketiParseEt(text, element, type) {
    try {
      let fromList, toList;

      if (type === "move") {
        // Taşıma aktivitesi
        const pattern = /(.+?)\s+listesinden\s+(.+?)\s+listesine\s+taşıdı/;
        const match = text.match(pattern);

        if (match) {
          fromList = match[1].replace(/.*bu kartı\s+/, "").trim();
          toList = match[2].replace(/.*bu kartı\s+/, "").trim();
        }
      } else if (type === "create") {
        // Kart oluşturma aktivitesi
        const pattern = /(.+?)\s+listesine\s+ekledi/;
        const match = text.match(pattern);

        if (match) {
          fromList = "Yok";
          toList = match[1].replace(/.*bu kartı\s+/, "").trim();
        }
      }

      if (!fromList || !toList) return null;

      // "listesine"/"listesinden" kalıntılarını temizle
      fromList = fromList
        .replace(/\s+listesinden$/i, "")
        .replace(/\s+listesine$/i, "")
        .trim();
      toList = toList
        .replace(/\s+listesine$/i, "")
        .replace(/\s+listesinden$/i, "")
        .trim();

      // Tarihi bul
      const tarih = tarihiBul(element);

      return {
        fromList,
        toList,
        tarih,
        type,
        rawText: text,
      };
    } catch (e) {
      console.log("Parse hatası:", e);
      return null;
    }
  }

  function calismaSessionslariniHesapla(hareketler) {
    const sessions = [];
    const sortedHareketler = [...hareketler].sort((a, b) => {
      if (a.tarih.getTime() === b.tarih.getTime()) {
        // Aynı saniyede ise: önce giriş, sonra çıkış işlenmeli
        if (a.toList.toLowerCase().includes("doing")) return -1;
        if (a.fromList.toLowerCase().includes("doing")) return 1;
      }
      return a.tarih - b.tarih;
    });

    const doingHareketleri = [];

    for (let hareket of sortedHareketler) {
      const from = hareket.fromList.toLowerCase();
      const to = hareket.toList.toLowerCase();

      const isDoingGiris = to.includes("doing") && !from.includes("doing");
      const isDoingCikis = from.includes("doing") && !to.includes("doing");
      const isDoingCreate = hareket.type === "create" && to.includes("doing");

      if (isDoingGiris || isDoingCreate) {
        doingHareketleri.push({ type: "giris", tarih: hareket.tarih, hareket });
      }

      if (isDoingCikis) {
        doingHareketleri.push({ type: "cikis", tarih: hareket.tarih, hareket });
      }
    }

    // Session hesaplama
    for (let i = 0; i < doingHareketleri.length; i++) {
      const current = doingHareketleri[i];

      if (current.type === "giris") {
        let nextCikis = doingHareketleri
          .slice(i + 1)
          .find((h) => h.type === "cikis");

        if (nextCikis) {
          const sure = nextCikis.tarih - current.tarih;
          const sureDakika = Math.round(sure / (1000 * 60));

          sessions.push({
            baslangic: current.tarih,
            bitis: nextCikis.tarih,
            sure,
            sureDakika,
            fromList: current.hareket.fromList,
            toList: current.hareket.toList,
            baslangicTarih: formatDate(current.tarih),
            baslangicSaat: formatTime(current.tarih),
            bitisTarih: formatDate(nextCikis.tarih),
            bitisSaat: formatTime(nextCikis.tarih),
          });

          i = doingHareketleri.indexOf(nextCikis); // çıkışa kadar ilerle
        } else {
          // çıkış bulunmadı → devam ediyor
          const simdi = new Date();
          const sure = simdi - current.tarih;
          const sureDakika = Math.round(sure / (1000 * 60));

          sessions.push({
            baslangic: current.tarih,
            bitis: simdi,
            sure,
            sureDakika,
            fromList: current.hareket.fromList,
            toList: current.hareket.toList,
            baslangicTarih: formatDate(current.tarih),
            baslangicSaat: formatTime(current.tarih),
            bitisTarih: "Devam ediyor",
            bitisSaat: "",
          });
        }
      }
    }

    return sessions.sort((a, b) => a.baslangic - b.baslangic);
  }

  function tarihiBul(element) {
    console.log("Tarih aranıyor elementte...");

    // Önce title attribute'undan dene
    const tarihLink = element.querySelector("a[title]");
    if (tarihLink && tarihLink.title) {
      console.log("Title attribute found:", tarihLink.title);
      const tarih = parseTarih(tarihLink.title);
      if (tarih) {
        console.log("Tarih title'dan bulundu:", tarih);
        return tarih;
      }
    }

    // Elementin içindeki tarih text'ini ara
    const text = element.textContent || "";
    console.log("Element text:", text);

    // Tarih pattern'lerini dene
    const tarihPatterns = [
      /(\d{1,2}\s+[A-Za-zğüşıöçĞÜŞİÖÇ]+\s+\d{4}\s+\d{1,2}:\d{2})/, // 30 Ağu 2025 15:20
      /(\d{1,2}\s+[A-Za-zğüşıöçĞÜŞİÖÇ]+\s+\d{4}\s+\d{1,2}\.\d{2})/, // 30 Ağu 2025 15.20
      /(\d{1,2}\s+[A-Za-zğüşıöçĞÜŞİÖÇ]+\s+\d{4})/, // 30 Ağu 2025
    ];

    for (const pattern of tarihPatterns) {
      const match = text.match(pattern);
      if (match) {
        console.log("Tarih pattern match:", match[0]);
        const tarih = parseTarih(match[0]);
        if (tarih) {
          console.log("Tarih text'ten bulundu:", tarih);
          return tarih;
        }
      }
    }

    console.log("Tarih bulunamadı elementte");
    return null;
  }

  function parseTarih(tarihText) {
    try {
      console.log("Parsing date:", tarihText);

      // Türkçe aylar (büyük-küçük harf duyarlı ve Türkçe karakterlerle)
      const turkceAylar = {
        oca: 0,
        şub: 1,
        mar: 2,
        nis: 3,
        may: 4,
        haz: 5,
        tem: 6,
        ağu: 7,
        ağu: 7,
        eyl: 8,
        eki: 9,
        kas: 10,
        ara: 11,
        Oca: 0,
        Şub: 1,
        Mar: 2,
        Nis: 3,
        May: 4,
        Haz: 5,
        Tem: 6,
        Ağu: 7,
        Ağu: 7,
        Eyl: 8,
        Eki: 9,
        Kas: 10,
        Ara: 11,
      };

      // Farklı tarih formatlarını dene
      const patterns = [
        /(\d{1,2})\s+([A-Za-zğüşıöçĞÜŞİÖÇ]+)\s+(\d{4})\s+(\d{1,2}):(\d{2})/, // 30 Ağu 2025 15:20
        /(\d{1,2})\s+([A-Za-zğüşıöçĞÜŞİÖÇ]+)\s+(\d{4})\s+(\d{1,2})\.(\d{2})/, // 30 Ağu 2025 15.20
        /(\d{1,2})\s+([A-Za-zğüşıöçĞÜŞİÖÇ]+)\s+(\d{4})/, // 30 Ağu 2025
      ];

      for (const pattern of patterns) {
        const match = tarihText.match(pattern);
        if (match) {
          let [, gun, ay, yil, saat, dakika] = match;

          // Varsayılan saat ve dakika
          saat = saat || "00";
          dakika = dakika || "00";

          // Ay ismini küçük harfe çevir
          const ayKucuk = ay.toLowerCase();
          const ayIndex = turkceAylar[ayKucuk];

          if (ayIndex !== undefined) {
            const date = new Date(
              parseInt(yil),
              ayIndex,
              parseInt(gun),
              parseInt(saat),
              parseInt(dakika)
            );

            console.log("Successfully parsed date:", date);
            return date;
          } else {
            console.log("Ay bulunamadı:", ay, "Küçük harf:", ayKucuk);
          }
        }
      }
    } catch (e) {
      console.log("Tarih parse hatası:", e);
    }

    console.log("Tarih parse edilemedi:", tarihText);
    return null;
  }

  function formatDate(tarih) {
    if (!tarih || isNaN(tarih.getTime())) return "Bilinmeyen";
    return `${tarih.getDate().toString().padStart(2, "0")}.${(
      tarih.getMonth() + 1
    )
      .toString()
      .padStart(2, "0")}.${tarih.getFullYear()}`;
  }

  function formatTime(tarih) {
    if (!tarih || isNaN(tarih.getTime())) return "Bilinmeyen";
    return `${tarih.getHours().toString().padStart(2, "0")}.${tarih
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
  }
}
