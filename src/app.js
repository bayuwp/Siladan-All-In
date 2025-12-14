// ===========================================
// 1. SETUP & IMPORT
// ===========================================
const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const crypto = require("crypto");
const cron = require("node-cron");
const swaggerUi = require("swagger-ui-express");
const { swaggerDocs, swaggerUiOptions } = require("./swagger.js");
require("dotenv").config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || "semogawahhabkuathehe";

// Root endpoint
app.get("/api/v1", (req, res) => {
  res.json({
    success: true,
    message: "Welcome to Service Desk API",
    version: "2.0.0",
  });
});

// Swagger UI setup
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocs, swaggerUiOptions)
);

// ===========================================
// 2. DATABASE CONNECTION
// ===========================================
const supabase = createClient(
  process.env.DB_SUPABASE_URL,
  process.env.DB_SUPABASE_KEY
);

// Test database connection
(async () => {
  try {
    const { error } = await supabase.from("users").select("count").limit(1);
    if (error) throw error;
    console.log("✅ Database Service Desk connected");
    console.log("✅ SSO Client initialized");
  } catch (err) {
    console.error("❌ Database connection error:", err.message);
  }
})();

// ===========================================
// 3. MIDDLEWARE GLOBAL
// ===========================================
app.use(cors());
app.use(express.json());

// API v1 router
const v1Router = express.Router();
app.use("/api/v1", v1Router);

// Root API v1 endpoint
v1Router.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Welcome to Siladan App API",
    version: "2.0.0",
  });
});

// ===========================================
// 4. DYNAMIC RBAC CONFIGURATION (DB DRIVEN)
// ===========================================
let RBAC_CACHE = {};

const reloadRbacCache = async () => {
  try {
    const { data, error } = await supabase
      .from("roles_config")
      .select("role_key, permissions, description");

    if (error) throw error;

    // Reset dan isi ulang cache
    RBAC_CACHE = {};
    data.forEach((role) => {
      RBAC_CACHE[role.role_key] = {
        permissions: role.permissions || [],
        description: role.description,
      };
    });

    console.log(
      `🔄 RBAC Cache Reloaded: ${Object.keys(RBAC_CACHE).length} roles loaded.`
    );
  } catch (err) {
    console.error("❌ Gagal memuat RBAC:", err.message);
  }
};
reloadRbacCache();

// ===========================================
// 5. AUTHENTICATION & AUTHORIZATION MIDDLEWARE
// ===========================================
const authenticate = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Token tidak ditemukan" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Token tidak valid" });
    }
    req.user = user;
    next();
  });
};

const authorize = (permission) => {
  return (req, res, next) => {
    const userRole = req.user.role;

    // Ambil config dari Cache
    const roleConfig = RBAC_CACHE[userRole];

    if (!roleConfig) {
      return res.status(403).json({
        error: "Role pengguna tidak valid atau tidak ditemukan konfigurasi.",
      });
    }

    // Logic Pengecekan Permission (Sama seperti sebelumnya)
    if (
      roleConfig.permissions.includes("*") ||
      roleConfig.permissions.includes(permission) ||
      roleConfig.permissions.some(
        (p) => p.endsWith(".*") && permission.startsWith(p.replace(".*", ""))
      )
    ) {
      next();
    } else {
      return res.status(403).json({
        error: "Akses Ditolak: Anda tidak memiliki izin untuk akses ini.",
        required: permission,
        your_role: userRole,
      });
    }
  };
};

// ===========================================
// 6. HELPER FUNCTIONS
// ===========================================
const calculatePriority = (urgency, impact) => {
  const score = urgency * impact;
  let category;
  if (score >= 1 && score <= 5) category = "low";
  else if (score >= 6 && score <= 10) category = "medium";
  else if (score >= 11 && score <= 15) category = "high";
  else category = "major";
  return { score, category };
};

const generateTicketNumber = (type) => {
  const prefix = type === "incident" ? "INC" : "REQ";
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `${prefix}-${year}-${random}`;
};

const calculateBusinessSLA = async (opdId, priority, startTime) => {
  try {
    // 1. Ambil konfigurasi durasi SLA (dalam jam)
    const { data: slaConfig } = await supabase
      .from("sla")
      .select("resolution_time")
      .eq("opd_id", opdId)
      .eq("priority", priority)
      .single();

    if (!slaConfig || !slaConfig.resolution_time) {
      console.warn(
        `⚠️ SLA Config missing for OPD ${opdId}, Priority ${priority}`
      );
      return null;
    }

    let remainingHours = slaConfig.resolution_time;
    let currentDate = new Date(startTime);

    // 2. Ambil Jadwal Kerja & Libur OPD
    const { data: workingHours } = await supabase
      .from("opd_working_hours")
      .select("day_of_week, start_time, end_time, is_working_day")
      .eq("opd_id", opdId);

    const { data: holidays } = await supabase
      .from("opd_holidays")
      .select("holiday_date")
      .eq("opd_id", opdId);

    const holidaySet = new Set(holidays?.map((h) => h.holiday_date) || []);

    let safetyCounter = 0;

    while (remainingHours > 0 && safetyCounter < 720) {
      currentDate.setHours(currentDate.getHours() + 1);
      safetyCounter++;

      const dateString = currentDate.toISOString().split("T")[0];
      const dayOfWeek = currentDate.getDay();

      if (holidaySet.has(dateString)) continue;

      const schedule = workingHours?.find((wh) => wh.day_of_week === dayOfWeek);

      if (!schedule || !schedule.is_working_day) continue;

      const startHour = parseInt(schedule.start_time.split(":")[0]);
      const endHour = parseInt(schedule.end_time.split(":")[0]);
      const currentHour = currentDate.getHours();

      if (currentHour > startHour && currentHour <= endHour) {
        remainingHours--;
      }
    }

    return {
      sla_due: currentDate,
      sla_target_date: currentDate.toISOString().split("T")[0],
      sla_target_time: currentDate.toTimeString().split(" ")[0],
    };
  } catch (error) {
    console.error("❌ Error calculating Business SLA:", error);
    return null;
  }
};
const logTicketActivity = async (
  ticketId,
  userId,
  action,
  description,
  oldValue = null,
  newValue = null
) => {
  try {
    await supabase.from("ticket_logs").insert({
      ticket_id: ticketId,
      user_id: userId,
      action,
      description,
      old_value: oldValue,
      new_value: newValue,
    });
  } catch (error) {
    console.error("Error logging activity:", error);
  }
};

const sendNotification = async (
  userId,
  title,
  message,
  type = "info",
  ticketId = null
) => {
  try {
    await supabase.from("notifications").insert({
      user_id: userId,
      title,
      message,
      type,
      related_ticket_id: ticketId,
    });
  } catch (error) {
    console.error("Error sending notification:", error);
  }
};
cron.schedule("*/10 * * * *", async () => {
  console.log("⏰ [CRON] Memeriksa SLA Breach...");

  try {
    const now = new Date().toISOString();

    // 1. Cari tiket yang:
    //    - Statusnya BUKAN (resolved, closed, rejected)
    //    - Waktu SLA Due-nya sudah lewat dari Sekarang
    //    - Belum ditandai 'sla_breached' (supaya tidak spam notifikasi berulang kali)
    const { data: breachedTickets, error } = await supabase
      .from("tickets")
      .select(
        `
        id, 
        ticket_number, 
        title, 
        assigned_to, 
        opd_id,
        technician:assigned_to(full_name, email)
      `
      )
      .lt("sla_due", now)
      .eq("sla_breached", false)
      .not("status", "in", "('resolved','closed','rejected')");

    if (error) throw error;

    if (breachedTickets && breachedTickets.length > 0) {
      console.warn(
        `⚠️ Ditemukan ${breachedTickets.length} tiket melanggar SLA!`
      );

      const ticketIds = breachedTickets.map((t) => t.id);

      // 2. Update status di Database agar tidak diproses lagi
      await supabase
        .from("tickets")
        .update({ sla_breached: true })
        .in("id", ticketIds);

      // 3. Lakukan Eskalasi (Kirim Notifikasi)
      for (const ticket of breachedTickets) {
        // A. Log Aktivitas Sistem
        await logTicketActivity(
          ticket.id,
          null, // System user
          "escalation",
          "SLA Terlewati. Eskalasi otomatis ke Admin OPD."
        );

        // B. Cari Admin OPD untuk dikirimi notifikasi eskalasi
        const { data: admins } = await supabase
          .from("users")
          .select("id")
          .eq("opd_id", ticket.opd_id)
          .eq("role", "admin_opd");

        // C. Kirim Notifikasi ke Teknisi (Peringatan) & Admin (Eskalasi)
        // Ke Teknisi
        if (ticket.assigned_to) {
          await sendNotification(
            ticket.assigned_to,
            "SLA BREACH ALERT",
            `Tiket ${ticket.ticket_number} telah melewati batas waktu!`,
            "error",
            ticket.id
          );
        }

        // Ke Admin OPD
        if (admins) {
          for (const admin of admins) {
            await sendNotification(
              admin.id,
              "ESKALASI TIKET",
              `Tiket ${ticket.ticket_number} belum selesai melewati SLA. Mohon tinjau.`,
              "warning",
              ticket.id
            );
          }
        }
      }
    } else {
      console.log("✅ Tidak ada SLA breach baru.");
    }
  } catch (err) {
    console.error("❌ [CRON ERROR] Gagal menjalankan SLA Check:", err.message);
  }
});

// ===========================================
// 7. AUTHENTICATION ROUTES
// ===========================================
const transformPermissionsForFrontend = (permissions) => {
  return permissions.map((perm) => {
    if (perm === "*") return { action: "manage", subject: "all" };

    const [subject, action] = perm.split(".");

    // Mapping Action agar sesuai standar Frontend (CASL)
    let finalAction = action;
    if (action === "*" || action === "write") finalAction = "manage";

    // Mapping Subject (Opsional: ubah jamak ke tunggal)
    let finalSubject = subject;
    // if (finalSubject.endsWith('s')) finalSubject = finalSubject.slice(0, -1);

    return { action: finalAction || "read", subject: finalSubject };
  });
};

v1Router.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Username dan password harus diisi" });
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: "Username atau password salah" });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Username atau password salah" });
    }

    // Update last login
    await supabase
      .from("users")
      .update({ last_login_at: new Date() })
      .eq("id", user.id);

    // Ambil permission dari Cache
    const rawPermissions = RBAC_CACHE[user.role]?.permissions || [];

    // --- PERUBAHAN DISINI: Format Permission ---
    const frontendPermissions = transformPermissionsForFrontend(rawPermissions);

    // Generate Token
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        opd_id: user.opd_id,
        // Di token tetap simpan string biar hemat size
        permissions: rawPermissions,
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        nip: user.nip,
        phone: user.phone,
        address: user.address,
        role: { id: user.role, name: user.role }, // Kirim object role
        opd_id: user.opd_id,
        // Kirim permission yang sudah diformat
        permissions: frontendPermissions,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

// Register
v1Router.post("/auth/register", async (req, res) => {
  try {
    const { username, password, email, full_name, nip, phone, address } =
      req.body;

    if (!username || !password || !email || !full_name) {
      return res.status(400).json({
        error: "Username, password, email, dan nama lengkap harus diisi",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from("users")
      .insert({
        username,
        password: hashedPassword,
        email,
        full_name,
        nip,
        phone,
        address,
        role: "pengguna",
        opd_id: null,
        bidang_id: null,
        seksi_id: null,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return res
          .status(400)
          .json({ error: "Username atau email sudah digunakan" });
      }
      throw error;
    }

    delete data.password;

    res.status(201).json({
      success: true,
      message: "Registrasi berhasil",
      user: data,
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

// Logout
v1Router.post("/auth/logout", authenticate, async (req, res) => {
  res.json({ success: true, message: "Logout berhasil" });
});

// Get Profile
v1Router.get("/auth/me", authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select(
        `
        id, 
        username, 
        email, 
        full_name, 
        nip, 
        phone, 
        address, 
        role, 
        avatar_url,
        opd:opd(id, name, code),
        bidang:bidang(id, name),
        seksi:seksi(id, name),
        created_at
      `
      )
      .eq("id", req.user.id)
      .single();

    if (error) throw error;

    res.json({ success: true, user: data });
  } catch (error) {
    console.error("Profile error:", error);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

v1Router.put("/auth/me", authenticate, async (req, res) => {
  try {
    const { username, avatar_url, phone, address } = req.body;

    const updateData = {};

    if (username) updateData.username = username; // Ganti full_name -> username
    if (avatar_url) updateData.avatar_url = avatar_url; // Field baru
    if (phone) updateData.phone = phone;
    if (address) updateData.address = address;

    const { data, error } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", req.user.id)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        // Kode error Postgres untuk duplikat
        return res
          .status(400)
          .json({ error: "Username sudah digunakan oleh pengguna lain." });
      }
      throw error;
    }

    res.json({
      success: true,
      message: "Profil berhasil diperbarui",
      user: data,
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

// Change Password
v1Router.post("/auth/change-password", authenticate, async (req, res) => {
  try {
    const { old_password, new_password, confirm_new_password } = req.body;

    if (!old_password || !new_password || !confirm_new_password) {
      return res.status(400).json({ error: "Semua field harus diisi" });
    }

    if (new_password !== confirm_new_password) {
      return res
        .status(400)
        .json({ error: "Password baru dan konfirmasi tidak cocok" });
    }

    // Ambil data user dari DB untuk cek password lama
    const { data: user, error } = await supabase
      .from("users")
      .select("password")
      .eq("id", req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: "User tidak ditemukan" });
    }

    // Verifikasi password lama
    const isValid = await bcrypt.compare(old_password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: "Password lama salah" });
    }

    // Hash password baru
    const hashedPassword = await bcrypt.hash(new_password, 10);

    // Update password di DB
    await supabase
      .from("users")
      .update({ password: hashedPassword })
      .eq("id", req.user.id);

    res.json({ success: true, message: "Password berhasil diubah" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

// Forgot Password (By Phone/WhatsApp)
v1Router.post("/auth/forgot-password", async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: "Nomor HP harus diisi" });
    }

    const { data: user } = await supabase
      .from("users")
      .select("id, phone, full_name")
      .eq("phone", phone)
      .single();

    if (!user) {
      // Security: Jangan beri tahu jika user tidak ditemukan
      return res.json({
        success: true,
        message: "Jika nomor terdaftar, OTP akan dikirim via WhatsApp",
      });
    }

    // Generate OTP 6 digit
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedToken = crypto
      .createHash("sha256")
      .update(otp)
      .digest("hex");

    // Simpan OTP ke tabel (berlaku 15 menit)
    await supabase.from("password_reset_tokens").insert({
      user_id: user.id,
      token: hashedToken, // Idealnya simpan hash-nya, atau plain jika untuk OTP pendek (kurang aman tapi umum untuk OTP) -> Disini kita simpan hash, verifikasi nanti hash input user
      expires_at: new Date(Date.now() + 15 * 60000), // 15 menit
    });

    // --- LOGIKA PENGIRIMAN WHATSAPP (PLACEHOLDER) ---
    // TODO: Integrasikan dengan provider WA Gateway (cth: Wablas, Twilio, Fonnte)
    console.log(`[MOCK WA] Kirim OTP ke ${phone}: Kode OTP Anda adalah ${otp}`);
    console.log(`[MOCK WA] Halo ${user.full_name}, gunakan kode ${otp} untuk reset password.`);

    res.json({
      success: true,
      message: "OTP reset password telah dikirim ke WhatsApp Anda",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

// ===========================================
// 8. INCIDENT MANAGEMENT ROUTES
// ===========================================
// Create Incident
v1Router.post(
  "/incidents",
  authenticate,
  authorize("incidents.create"),
  async (req, res) => {
    try {
      const {
        title,
        description,
        category,
        incident_location,
        incident_date,
        opd_id,
        asset_identifier,
        attachment_url,
      } = req.body;

      if (!title || !description) {
        return res.status(400).json({ error: "Data tidak lengkap" });
      }

      const urgencyVal = 3;
      const impactVal = 3;

      const { score: priorityScore, category: priorityCategory } =
        calculatePriority(urgencyVal, impactVal);

      const ticketNumber = generateTicketNumber("incident");
      const targetOpdId = opd_id || req.user.opd_id;
      const creationTime = new Date();

      // --- PERUBAHAN: Logic hitung SLA dihapus dari sini ---
      // Timer SLA belum jalan saat tiket baru dibuat (status Open).
      // Timer akan mulai jalan nanti saat endpoint 'assign' dipanggil.

      const { data: reporter } = await supabase
        .from("users")
        .select("nip")
        .eq("id", req.user.id)
        .single();

      const { data: ticket, error } = await supabase
        .from("tickets")
        .insert({
          ticket_number: ticketNumber,
          type: "incident",
          title,
          description,
          urgency: urgencyVal,
          impact: impactVal,
          priority_score: priorityScore,
          priority: priorityCategory,
          category: category || "Umum",
          incident_location,
          incident_date: incident_date || null,
          opd_id: targetOpdId,
          reporter_id: req.user.id,
          reporter_nip: reporter?.nip,
          status: "open",
          stage: "triase",

          // --- SLA DI-SET KOSONG DULU ---
          sla_due: null,
          sla_target_date: null,
          sla_target_time: null,
          sla_breached: false,

          asset_name_reported: asset_identifier || null,
          reporter_attachment_url: attachment_url || null,
          created_at: creationTime,
        })
        .select()
        .single();

      if (error) throw error;

      await logTicketActivity(
        ticket.id,
        req.user.id,
        "create",
        `Incident created: ${ticketNumber}`
      );

      res
        .status(201)
        .json({ success: true, message: "Incident berhasil dibuat", ticket });
    } catch (error) {
      console.error("Create incident error:", error);
      res.status(500).json({ error: "Terjadi kesalahan server" });
    }
  }
);

// Create Public Incident
v1Router.post("/public/incidents", async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      incident_location,
      incident_date,
      opd_id,
      asset_identifier,
      reporter_name,
      reporter_email,
      reporter_phone,
      reporter_address,
      reporter_nik,
      attachment_url,
    } = req.body;

    // Validasi input yang lebih ketat
    if (
      !title ||
      !description ||
      !opd_id ||
      !reporter_name ||
      !reporter_email ||
      !reporter_phone
    ) {
      return res.status(400).json({
        error:
          "Data insiden dan data pelapor (nama, email, HP, OPD) tidak boleh kosong",
      });
    }

    // Validasi format email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(reporter_email)) {
      return res.status(400).json({
        error: "Format email tidak valid",
      });
    }

    const urgencyVal = 3;
    const impactVal = 3;
    const { score: priorityScore, category: priorityCategory } =
      calculatePriority(urgencyVal, impactVal);

    const ticketNumber = generateTicketNumber("incident");
    const creationTime = new Date();

    // Perbaikan: Gunakan opd_id yang sudah ada dari req.body
    const slaDataRaw = await calculateBusinessSLA(
      opd_id,
      priorityCategory,
      creationTime
    );

    // Fallback dengan logging jika SLA calculation gagal
    let slaData = slaDataRaw;
    if (!slaData) {
      console.warn(
        `SLA calculation failed for OPD ${opd_id}, Priority ${priorityCategory}`
      );
      slaData = {
        sla_due: null,
        sla_target_date: null,
        sla_target_time: null,
      };
    }

    const { data: ticket, error } = await supabase
      .from("tickets")
      .insert({
        ticket_number: ticketNumber,
        type: "incident",
        title,
        description,
        urgency: urgencyVal,
        impact: impactVal,
        priority_score: priorityScore,
        priority: priorityCategory,
        category: category || "Umum",
        incident_location,
        incident_date: incident_date || null,
        opd_id: opd_id,
        reporter_id: null,
        reporter_nip: reporter_nik || null,
        status: "open",
        ...slaData,
        reporter_name: reporter_name,
        reporter_email: reporter_email,
        reporter_phone: reporter_phone,
        reporter_address: reporter_address || null,
        asset_name_reported: asset_identifier || null,
        reporter_attachment_url: attachment_url || null,
        created_at: creationTime,
      })
      .select()
      .single();

    if (error) {
      console.error("Database error when creating public incident:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      throw error;
    }

    await logTicketActivity(
      ticket.id,
      null,
      "create_public",
      `Public Incident created: ${ticketNumber}`
    );

    res.status(201).json({
      success: true,
      message: "Insiden berhasil dilaporkan",
      ticket: ticket,
    });
  } catch (error) {
    console.error("Create public incident error:", {
      message: error.message,
      stack: error.stack,
      body: req.body,
    });
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

// Get Public OPD
v1Router.get("/public/opd", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("opd")
      .select("id, name")
      .eq("is_active", true)
      .order("name");

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    console.error("Get public OPD error:", error);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

// Get Public Ticket
v1Router.get("/public/tickets/:ticket_number", async (req, res) => {
  try {
    const { ticket_number } = req.params;

    console.log("🔍 Mencari tiket:", ticket_number);

    const { data: ticket, error } = await supabase
      .from("tickets")
      .select(
        `
        id,
        ticket_number,
        title,
        description,
        status,
        category,
        priority,
        incident_location,
        created_at,
        updated_at,
        opd:opd_id ( name ), 
        reporter_name
      `
      )
      .ilike("ticket_number", ticket_number)
      .maybeSingle();

    if (error) {
      console.error("❌ Supabase Error:", error);
      return res.status(500).json({
        error: "Terjadi kesalahan database",
        details: error.message,
      });
    }

    if (!ticket) {
      console.warn("⚠️ Tiket tidak ditemukan di DB");
      return res.status(404).json({
        error: "Tiket tidak ditemukan. Periksa kembali nomor tiket Anda.",
      });
    }

    await supabase.from("ticket_progress_updates").insert({
      ticket_id: ticket.id,
      update_number: 1,
      updated_by: req.user?.id || null,
      status_change: "Open",
      handling_description: "Tiket berhasil dibuat dan masuk antrian.",
      update_time: new Date(),
    });

    const { data: history } = await supabase
      .from("ticket_progress_updates")
      .select("update_time, status_change, handling_description")
      .eq("ticket_id", ticket.id)
      .order("update_time", { ascending: false });

    res.json({
      success: true,
      data: {
        ticket_info: {
          ticket_number: ticket.ticket_number,
          title: ticket.title,
          description: ticket.description,
          status: ticket.status,
          category: ticket.category,
          opd_name: ticket.opd?.name,
          location: ticket.incident_location,
          reporter_name: ticket.reporter_name,
          created_at: ticket.created_at,
          last_updated: ticket.updated_at,
        },
        timeline: history || [],
      },
    });
  } catch (error) {
    console.error("Track ticket error:", error);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

// Get Incidents
v1Router.get("/incidents", authenticate, async (req, res) => {
  try {
    const {
      status,
      priority,
      search,
      opd_id,
      page = 1,
      limit = 20,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabase
      .from("tickets")
      .select(
        `
        *,
        reporter:reporter_id(id, username, full_name, email, nip, phone),
        recorder:recorder_id(id, username, full_name),
        verifier:verifier_id(id, username, full_name),
        technician:assigned_to(id, username, full_name),
        opd:opd_id(id, name, code)
      `,
        { count: "exact" }
      )
      .eq("type", "incident")
      .order("created_at", { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (req.user.role === "pengguna" || req.user.role === "pegawai_opd") {
      query = query.eq("reporter_id", req.user.id);
    } else if (req.user.role === "teknisi") {
      query = query.eq("assigned_to", req.user.id);
    } else if (
      ["admin_opd", "bidang", "seksi", "helpdesk"].includes(req.user.role)
    ) {
      query = query.eq("opd_id", req.user.opd_id);
    }

    if (status) query = query.eq("status", status);
    if (priority) query = query.eq("priority", priority);
    if (opd_id) query = query.eq("opd_id", opd_id);
    if (search) {
      query = query.or(
        `title.ilike.%${search}%,ticket_number.ilike.%${search}%,description.ilike.%${search}%`
      );
    }

    const { data, count, error } = await query;
    if (error) throw error;

    res.json({
      success: true,
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        total_pages: Math.ceil(count / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Get incidents error:", error);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

// Get Incident Detail
v1Router.get(
  "/incidents/:id",
  authenticate,
  authorize("tickets.read"),
  async (req, res) => {
    try {
      const { data: ticket, error } = await supabase
        .from("tickets")
        .select(
          `
        *,
        reporter:reporter_id(id, username, full_name, email, nip, phone, address),
        recorder:recorder_id(id, username, full_name, nip),
        verifier:verifier_id(id, username, full_name, nip),
        technician:assigned_to(id, username, full_name, phone, nip),
        opd:opd_id(id, name, code, address),
        bidang:bidang_id(id, name),
        seksi:seksi_id(id, name)
      `
        )
        .eq("id", req.params.id)
        .eq("type", "incident")
        .single();

      if (error) throw error;
      if (!ticket) {
        return res.status(404).json({ error: "Incident tidak ditemukan" });
      }

      if (req.user.role === "pengguna" && ticket.reporter_id !== req.user.id) {
        return res.status(403).json({ error: "Akses ditolak" });
      }

      const { data: attachments } = await supabase
        .from("ticket_attachments")
        .select("*")
        .eq("ticket_id", req.params.id)
        .is("progress_update_id", null);

      const { data: progressUpdates } = await supabase
        .from("ticket_progress_updates")
        .select(`*, updated_by_user:updated_by(id, username, full_name)`)
        .eq("ticket_id", req.params.id)
        .order("update_number");

      const { data: comments } = await supabase
        .from("ticket_comments")
        .select(`*, user:user_id(id, username, full_name)`)
        .eq("ticket_id", req.params.id)
        .order("created_at");

      const { data: logs } = await supabase
        .from("ticket_logs")
        .select(`*, user:user_id(username, full_name)`)
        .eq("ticket_id", req.params.id)
        .order("created_at", { ascending: false })
        .limit(20);

      res.json({
        success: true,
        ticket,
        attachments: attachments || [],
        progress_updates: progressUpdates || [],
        comments: comments || [],
        logs: logs || [],
      });
    } catch (error) {
      console.error("Get incident detail error:", error);
      res.status(500).json({ error: "Terjadi kesalahan server" });
    }
  }
);

// Classify Incident
v1Router.put(
  "/incidents/:id/classify",
  authenticate,
  authorize("tickets.write"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { urgency, impact } = req.body;
      const userId = req.user.id;

      if (!urgency || !impact) {
        return res
          .status(400)
          .json({ error: "Urgency dan impact harus diisi" });
      }

      const urgencyVal = parseInt(urgency);
      const impactVal = parseInt(impact);

      const { data: currentTicket, error: getError } = await supabase
        .from("tickets")
        .select("opd_id, created_at")
        .eq("id", id)
        .single();

      if (getError || !currentTicket) {
        return res.status(404).json({ error: "Tiket tidak ditemukan" });
      }

      const { score: priorityScore, category: priorityCategory } =
        calculatePriority(urgencyVal, impactVal);

      const slaDataRaw = await calculateBusinessSLA(
        currentTicket.opd_id,
        priorityCategory,
        new Date(currentTicket.created_at)
      );
      // Fallback simpel jika calculateBusinessSLA gagal/null (misal data master belum diisi)
      const slaData = slaDataRaw || {
        sla_due: null,
        sla_target_date: null,
        sla_target_time: null,
      };

      const { data: updatedTicket, error: updateError } = await supabase
        .from("tickets")
        .update({
          urgency: urgencyVal,
          impact: impactVal,
          priority: priorityCategory,
          priority_score: priorityScore,
          ...slaData,
          updated_at: new Date(),
        })
        .eq("id", id)
        .select()
        .single();

      if (updateError) throw updateError;

      await logTicketActivity(
        id,
        userId,
        "classify",
        `Tiket diklasifikasi oleh Seksi. Prioritas baru: ${priorityCategory} (U: ${urgencyVal}, I: ${impactVal})`
      );

      res.json({
        success: true,
        message: "Insiden berhasil diklasifikasi dan prioritas diperbarui",
        ticket: updatedTicket,
      });
    } catch (error) {
      console.error("Classify incident error:", error);
      res.status(500).json({ error: "Terjadi kesalahan server" });
    }
  }
);

// Update Incident
v1Router.put(
  "/incidents/:id",
  authenticate,
  authorize("tickets.write"),
  async (req, res) => {
    try {
      const updateData = {};
      const allowedFields = [
        "title",
        "description",
        "category",
        "status",
        "assigned_to",
        "stage",
      ];

      allowedFields.forEach((field) => {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      });

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "Tidak ada data untuk diupdate" });
      }

      updateData.updated_at = new Date();

      const { data, error } = await supabase
        .from("tickets")
        .update(updateData)
        .eq("id", req.params.id)
        .eq("type", "incident")
        .select()
        .single();

      if (error) throw error;

      await logTicketActivity(
        req.params.id,
        req.user.id,
        "update",
        `Incident diperbarui oleh ${req.user.role}`
      );

      res.json({
        success: true,
        message: "Incident berhasil diperbarui",
        ticket: data,
      });
    } catch (error) {
      console.error("Update incident error:", error);
      res.status(500).json({ error: "Terjadi kesalahan server" });
    }
  }
);

// Merge Incidents
v1Router.post(
  "/incidents/merge",
  authenticate,
  authorize("tickets.write"),
  async (req, res) => {
    try {
      const { source_ticket_ids, target_ticket_id, reason } = req.body;

      if (!source_ticket_ids || !target_ticket_id || !reason) {
        return res.status(400).json({ error: "Data tidak lengkap" });
      }

      await supabase
        .from("tickets")
        .update({
          status: "closed", // Gunakan status resmi 'closed'
          merged_to: target_ticket_id,
          merge_reason: reason,
          resolution: `Tiket digabung ke ${target_ticket_id}. Alasan: ${reason}`, // Catat disini
          closed_at: new Date(),
        })
        .in("id", source_ticket_ids)
        .eq("type", "incident");

      for (const ticketId of source_ticket_ids) {
        await logTicketActivity(
          ticketId,
          req.user.id,
          "merge",
          `Merged to incident ${target_ticket_id}: ${reason}`
        );
      }

      await logTicketActivity(
        target_ticket_id,
        req.user.id,
        "merge",
        `Received merged incidents: ${source_ticket_ids.join(", ")}`
      );

      res.json({ success: true, message: "Incidents berhasil di-merge" });
    } catch (error) {
      console.error("Merge incidents error:", error);
      res.status(500).json({ error: "Terjadi kesalahan server" });
    }
  }
);
// Endpoint khusus untuk Assign/Reassign Teknisi dengan SLA Start on Assignment
v1Router.put("/incidents/:id/assign", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { technician_id } = req.body;
    const userPermissions = req.user.permissions;

    if (!technician_id) {
      return res
        .status(400)
        .json({ error: "ID Teknisi (technician_id) harus diisi." });
    }

    // 1. Ambil data tiket saat ini
    // PERBAIKAN: Kita perlu opd_id dan priority untuk menghitung ulang SLA
    const { data: ticket, error: fetchError } = await supabase
      .from("tickets")
      .select("id, assigned_to, ticket_number, opd_id, priority")
      .eq("id", id)
      .single();

    if (fetchError || !ticket) {
      return res.status(404).json({ error: "Tiket tidak ditemukan" });
    }

    // 2. LOGIC PERMISSION CHECKING
    const isReassign = ticket.assigned_to !== null; // Cek apakah ini re-assign?

    if (isReassign) {
      // Kalau sudah ada teknisi, butuh izin 'tickets.reassign'
      if (
        !userPermissions.includes("tickets.reassign") &&
        !userPermissions.includes("*")
      ) {
        return res.status(403).json({
          error: "Anda tidak memiliki izin untuk mengganti teknisi (Reassign).",
        });
      }
    } else {
      // Kalau belum ada teknisi, butuh izin 'tickets.assign'
      if (
        !userPermissions.includes("tickets.assign") &&
        !userPermissions.includes("*")
      ) {
        return res.status(403).json({
          error: "Anda tidak memiliki izin untuk menunjuk teknisi (Assign).",
        });
      }
    }

    // 3. LOGIC HITUNG SLA (Start saat Assignment)
    // ===========================================
    const assignmentTime = new Date(); // Waktu start SLA adalah SEKARANG

    let slaData = {
      sla_due: null,
      sla_target_date: null,
      sla_target_time: null,
    };

    // Panggil helper calculateBusinessSLA
    const slaDataRaw = await calculateBusinessSLA(
      ticket.opd_id,
      ticket.priority,
      assignmentTime
    );

    if (slaDataRaw) {
      slaData = slaDataRaw;
    } else {
      console.warn(
        `⚠️ Gagal menghitung SLA saat assign untuk tiket ${ticket.ticket_number}`
      );
    }
    // ===========================================

    // 4. Lakukan Update dengan Data SLA Baru
    const { data: updatedTicket, error } = await supabase
      .from("tickets")
      .update({
        assigned_to: technician_id,
        status: "assigned", // Otomatis ubah status jadi assigned
        updated_at: assignmentTime, // Update waktu update
        ...slaData, // Masukkan data SLA (sla_due, target date, dll) ke DB
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // 5. Catat Log Activity
    const actionType = isReassign ? "reassign" : "assign";
    await logTicketActivity(
      id,
      req.user.id,
      actionType,
      `Technician ${
        isReassign ? "changed" : "assigned"
      } to user ID ${technician_id}. SLA Timer started.`
    );

    res.json({
      success: true,
      message: isReassign
        ? "Teknisi berhasil diganti & SLA direset"
        : "Teknisi berhasil ditugaskan & SLA dimulai",
      ticket: updatedTicket,
    });
  } catch (error) {
    console.error("Assign error:", error);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});
// ===========================================
// 9. SERVICE REQUEST MANAGEMENT ROUTES
// ===========================================
// Get Service Catalog
v1Router.get("/catalog", authenticate, async (req, res) => {
  try {
    const { opd_id, is_active } = req.query;

    let query = supabase
      .from("service_catalog")
      .select("*")
      .order("display_order");

    if (opd_id) query = query.eq("opd_id", opd_id);
    if (is_active !== undefined) {
      const isActiveValue = is_active === "true" || is_active === '"true"';
      query = query.eq("is_active", isActiveValue);
    }

    const { data: catalogs, error } = await query;
    if (error) throw error;

    const formattedData = [];

    for (const catalog of catalogs || []) {
      // 1. Ambil semua items untuk catalog ini
      const { data: items } = await supabase
        .from("service_items")
        .select(
          "id, item_code, parent_item_id, item_name, item_level, description, approval_required, required_fields"
        )
        .eq("catalog_id", catalog.id)
        .eq("is_active", true)
        .order("display_order");

      // Filter Level 2 (Sub-Layanan / Parent)
      const subLayanan_raw =
        items?.filter(
          (i) => i.item_level === "sub_layanan" && !i.parent_item_id
        ) || [];

      // Mapping Level 2 -> Format Frontend
      const childrenLevel2 = subLayanan_raw.map((sub) => {
        // Filter Level 3 (Service Items / Child)
        const level3_items_raw =
          items?.filter((i) => i.parent_item_id === sub.id) || [];

        // Mapping Level 3 -> Format Frontend
        const childrenLevel3 = level3_items_raw.map((item) => ({
          id: item.id, // Atau item.item_code jika ingin string "SRV-001"
          name: item.item_name,
          desc: item.description,
          // Custom logic: jika ada field 'asset_id' di required_fields, berarti butuh aset
          needAsset: JSON.stringify(item.required_fields || {}).includes(
            "asset"
          ),
          workflow: item.approval_required ? "approval" : "internal",
        }));

        return {
          id: sub.id, // Atau sub.item_code
          name: sub.item_name,
          // Logic: Jika sub-layanan butuh aset (bisa diset manual atau cek anak-anaknya)
          needAsset: childrenLevel3.some((c) => c.needAsset),
          workflow: "internal", // Default untuk grouping
          children: childrenLevel3,
        };
      });

      // Mapping Level 1 (Catalog) -> Format Frontend
      formattedData.push({
        id: catalog.id, // Atau catalog.catalog_code ("CAT-001")
        name: catalog.catalog_name,
        icon: catalog.icon || "folder",
        isReadOnly: true, // Level 1 biasanya hanya judul
        children: childrenLevel2,
      });
    }

    // Kirim response langsung array (atau bungkus data jika perlu)
    res.json({
      success: true,
      data: formattedData,
    });
  } catch (error) {
    console.error("Get catalogs error:", error);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});
v1Router.post(
  "/admin/catalog/items",
  authenticate,
  authorize("opd.write"),
  async (req, res) => {
    try {
      const {
        catalog_id,
        parent_item_id,
        item_name,
        description,
        item_level,
        // Ambil field baru dari request body
        needAsset,
        workflow,
      } = req.body;

      if (!item_name || !item_level) {
        return res
          .status(400)
          .json({ error: "Nama item dan level wajib diisi" });
      }

      // --- LOGIC MAPPING: Request Body -> Database Columns ---
      const dbApprovalRequired = workflow === "approval";
      // Jika needAsset true, kita set required_fields agar deteksi 'asset' bekerja
      const dbRequiredFields = needAsset
        ? { asset_identifier: "required" }
        : {};

      const { data, error } = await supabase
        .from("service_items")
        .insert({
          opd_id: req.user.opd_id,
          catalog_id: catalog_id || null,
          parent_item_id: parent_item_id || null,
          item_name,
          description,
          item_level,
          // Simpan hasil mapping ke DB
          approval_required: dbApprovalRequired,
          required_fields: dbRequiredFields,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      // Logic mapping untuk response frontend
      const responseData = {
        ...data,
        needAsset: JSON.stringify(data.required_fields || {}).includes("asset"),
        workflow: data.approval_required ? "approval" : "internal",
      };

      res.status(201).json({
        success: true,
        message: "Item layanan berhasil ditambahkan",
        data: responseData,
      });
    } catch (error) {
      console.error("Create catalog item error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);
v1Router.put(
  "/admin/catalog/items/:id",
  authenticate,
  authorize("opd.write"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { needAsset, workflow, ...restBody } = req.body;

      const updateData = { ...restBody };
      if (workflow !== undefined) {
        updateData.approval_required = workflow === "approval";
      }

      if (needAsset !== undefined) {
        updateData.required_fields = needAsset
          ? { asset_identifier: "required" }
          : {};
      }

      delete updateData.id;
      delete updateData.opd_id;
      delete updateData.created_at;

      updateData.updated_at = new Date();
      const { data, error } = await supabase
        .from("service_items")
        .update(updateData)
        .eq("id", id)
        .eq("opd_id", req.user.opd_id) // Filter: Pastikan hanya edit milik OPD sendiri
        .select()
        .maybeSingle(); // <--- PENTING: Gunakan maybeSingle agar tidak error jika data tidak ditemukan/beda OPD

      if (error) throw error;

      // 5. Validasi Hasil Query
      if (!data) {
        return res.status(404).json({
          error:
            "Item tidak ditemukan atau Anda tidak memiliki akses untuk mengeditnya (Beda OPD).",
        });
      }

      // 6. Logic mapping untuk response ke Frontend
      // Kita kembalikan format 'needAsset' & 'workflow' agar UI frontend langsung sync
      const responseData = {
        ...data,
        needAsset: JSON.stringify(data.required_fields || {}).includes("asset"),
        workflow: data.approval_required ? "approval" : "internal",
      };

      res.json({
        success: true,
        message: "Item layanan berhasil diperbarui",
        data: responseData,
      });
    } catch (error) {
      console.error("Update catalog item error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);
// Delete Service Catalog Item
v1Router.delete(
  "/admin/catalog/items/:id",
  authenticate,
  authorize("opd.write"),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Hapus item dengan filter OPD untuk keamanan
      const { data, error } = await supabase
        .from("service_items")
        .delete()
        .eq("id", id)
        .eq("opd_id", req.user.opd_id) // SECURITY: Hanya bisa hapus milik OPD sendiri
        .select()
        .maybeSingle(); // <--- PERBAIKAN: Gunakan maybeSingle()

      if (error) {
        if (error.code === "23503") {
          return res.status(400).json({
            error:
              "Gagal menghapus: Item ini masih memiliki sub-layanan atau sedang digunakan dalam tiket aktif.",
          });
        }
        throw error;
      }

      if (!data) {
        return res.status(404).json({
          error:
            "Item tidak ditemukan atau Anda tidak memiliki akses untuk menghapusnya (Beda OPD).",
        });
      }

      res.json({
        success: true,
        message: "Item layanan berhasil dihapus",
        data,
      });
    } catch (error) {
      console.error("Delete catalog item error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);
// Create Service Request
v1Router.post(
  "/requests",
  authenticate,
  authorize("requests.create"),
  async (req, res) => {
    try {
      const {
        title,
        description,
        service_item_id,
        service_detail,
        attachment_url,
        requested_date,
      } = req.body;

      if (!title || !description || !service_item_id) {
        return res.status(400).json({
          error: "Title, description, dan service_item_id tidak boleh kosong",
        });
      }

      const targetOpdId = req.user.opd_id;
      if (!targetOpdId) {
        return res
          .status(400)
          .json({ error: "Akun Anda tidak terhubung ke OPD manapun." });
      }

      const { data: itemData, error: itemError } = await supabase
        .from("service_items")
        .select("catalog_id, approval_required, approval_levels")
        .eq("id", service_item_id)
        .single();

      if (itemError || !itemData) {
        return res
          .status(404)
          .json({ error: "Service Item (Layanan) tidak ditemukan" });
      }

      const initialStatus = itemData.approval_required
        ? "pending_approval"
        : "open";
      const initialStage = itemData.approval_required
        ? "approval_seksi"
        : "triase";

      const ticketNumber = generateTicketNumber("request");
      const creationTime = new Date();

      const { data: reporter } = await supabase
        .from("users")
        .select("nip")
        .eq("id", req.user.id)
        .single();

      const priorityCategory = "medium";

      const slaDataRaw = await calculateBusinessSLA(
        targetOpdId,
        priorityCategory,
        creationTime
      );
      // Fallback simpel jika calculateBusinessSLA gagal/null (misal data master belum diisi)
      const slaData = slaDataRaw || {
        sla_due: null,
        sla_target_date: null,
        sla_target_time: null,
      };

      const { data: ticket, error } = await supabase
        .from("tickets")
        .insert({
          ticket_number: ticketNumber,
          type: "request",
          title,
          description,
          service_catalog_id: itemData.catalog_id,
          service_item_id: service_item_id,
          service_detail: service_detail,
          opd_id: targetOpdId,
          reporter_id: req.user.id,
          reporter_nip: reporter?.nip,
          status: initialStatus,
          stage: initialStage,
          priority: priorityCategory,
          ...slaData,
          reporter_attachment_url: attachment_url || null,
          requested_date: requested_date || null,
          created_at: creationTime,
        })
        .select()
        .single();

      if (error) throw error;

      if (itemData.approval_required && itemData.approval_levels) {
        const levels = itemData.approval_levels;

        if (Array.isArray(levels) && levels.length > 0) {
          const workflowInserts = levels.map((roleName, index) => ({
            ticket_id: ticket.id,
            workflow_level: index + 1,
            approver_role: roleName,
            status: "pending",
            created_at: new Date(),
          }));

          const { error: wfError } = await supabase
            .from("approval_workflows")
            .insert(workflowInserts);

          if (wfError) {
            console.error(
              "CRITICAL: Gagal membuat approval workflow",
              wfError.message
            );
          }
        }
      }

      await logTicketActivity(
        ticket.id,
        req.user.id,
        "create",
        `Service request created: ${ticketNumber}`
      );

      res.status(201).json({
        success: true,
        message: "Service request berhasil dibuat",
        ticket,
      });
    } catch (error) {
      console.error("Create request error:", error);
      res.status(500).json({ error: "Terjadi kesalahan server" });
    }
  }
);

// Get Service Requests
v1Router.get("/requests", authenticate, async (req, res) => {
  try {
    const { status, search, opd_id, page = 1, limit = 20 } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabase
      .from("tickets")
      .select(
        `
        *,
        reporter:reporter_id(id, username, full_name, email, nip, phone),
        technician:assigned_to(id, username, full_name),
        opd:opd_id(id, name, code),
        service_catalog:service_catalog_id(id, catalog_name),
        service_item:service_item_id(id, item_name)
      `,
        { count: "exact" }
      )
      .eq("type", "request")
      .order("created_at", { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (req.user.role === "pengguna" || req.user.role === "pegawai_opd") {
      query = query.eq("reporter_id", req.user.id);
    } else if (req.user.role === "teknisi") {
      query = query.eq("assigned_to", req.user.id);
    } else if (
      ["admin_opd", "bidang", "seksi", "helpdesk"].includes(req.user.role)
    ) {
      query = query.eq("opd_id", req.user.opd_id);
    }

    if (status) query = query.eq("status", status);
    if (opd_id) query = query.eq("opd_id", opd_id);
    if (search) {
      query = query.or(
        `title.ilike.%${search}%,ticket_number.ilike.%${search}%,description.ilike.%${search}%`
      );
    }

    const { data, count, error } = await query;
    if (error) throw error;

    res.json({
      success: true,
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        total_pages: Math.ceil(count / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Get requests error:", error);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

// Get Service Request Detail
v1Router.get(
  "/requests/:id",
  authenticate,
  authorize("tickets.read"),
  async (req, res) => {
    try {
      const { data: ticket, error } = await supabase
        .from("tickets")
        .select(
          `
        *,
        reporter:reporter_id(id, username, full_name, email, nip, phone),
        technician:assigned_to(id, username, full_name, phone, nip),
        opd:opd_id(id, name, code),
        service_catalog:service_catalog_id(id, catalog_name, description),
        service_item:service_item_id(id, item_name, description)
      `
        )
        .eq("id", req.params.id)
        .eq("type", "request")
        .single();

      if (error) throw error;
      if (!ticket) {
        return res
          .status(404)
          .json({ error: "Service request tidak ditemukan" });
      }

      if (
        (req.user.role === "pengguna" || req.user.role === "pegawai_opd") &&
        ticket.reporter_id !== req.user.id
      ) {
        return res.status(403).json({ error: "Akses ditolak" });
      }

      const { data: approvals } = await supabase
        .from("approval_workflows")
        .select("*")
        .eq("ticket_id", req.params.id)
        .order("workflow_level");

      const { data: progressUpdates } = await supabase
        .from("ticket_progress_updates")
        .select(`*, updated_by_user:updated_by(id, username, full_name)`)
        .eq("ticket_id", req.params.id)
        .order("update_number");

      res.json({
        success: true,
        ticket,
        approvals: approvals || [],
        progress_updates: progressUpdates || [],
      });
    } catch (error) {
      console.error("Get request detail error:", error);
      res.status(500).json({ error: "Terjadi kesalahan server" });
    }
  }
);

// Update Service Request
v1Router.put(
  "/requests/:id",
  authenticate,
  authorize("tickets.write"),
  async (req, res) => {
    try {
      const updateData = {};
      const allowedFields = [
        "title",
        "description",
        "category",
        "status",
        "assigned_to",
        "stage",
      ];

      allowedFields.forEach((field) => {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      });

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "Tidak ada data untuk diupdate" });
      }

      updateData.updated_at = new Date();

      const { data, error } = await supabase
        .from("tickets")
        .update(updateData)
        .eq("id", req.params.id)
        .eq("type", "request")
        .select()
        .single();

      if (error) throw error;

      await logTicketActivity(
        req.params.id,
        req.user.id,
        "update",
        "Service request diperbarui"
      );

      res.json({
        success: true,
        message: "Service request berhasil diperbarui",
        ticket: data,
      });
    } catch (error) {
      console.error("Update request error:", error);
      res.status(500).json({ error: "Terjadi kesalahan server" });
    }
  }
);

// Classify Service Request
v1Router.put(
  "/requests/:id/classify",
  authenticate,
  authorize("tickets.write"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { urgency, impact } = req.body;
      const userId = req.user.id;

      if (!urgency || !impact) {
        return res
          .status(400)
          .json({ error: "Urgency dan impact harus diisi" });
      }

      const urgencyVal = parseInt(urgency);
      const impactVal = parseInt(impact);

      // Verify ticket existence and get necessary data for SLA calc
      const { data: currentTicket, error: getError } = await supabase
        .from("tickets")
        .select("opd_id, created_at, type")
        .eq("id", id)
        .eq("type", "request")
        .single();

      if (getError || !currentTicket) {
        return res
          .status(404)
          .json({ error: "Service request tidak ditemukan" });
      }

      const { score: priorityScore, category: priorityCategory } =
        calculatePriority(urgencyVal, impactVal);

      // Recalculate SLA based on new priority
      const slaDataRaw = await calculateBusinessSLA(
        currentTicket.opd_id,
        priorityCategory,
        new Date(currentTicket.created_at)
      );

      const slaData = slaDataRaw || {
        sla_due: null,
        sla_target_date: null,
        sla_target_time: null,
      };

      const { data: updatedTicket, error: updateError } = await supabase
        .from("tickets")
        .update({
          urgency: urgencyVal,
          impact: impactVal,
          priority: priorityCategory,
          priority_score: priorityScore,
          ...slaData,
          updated_at: new Date(),
        })
        .eq("id", id)
        .select()
        .single();

      if (updateError) throw updateError;

      await logTicketActivity(
        id,
        userId,
        "classify",
        `Request diklasifikasi. Prioritas baru: ${priorityCategory} (U: ${urgencyVal}, I: ${impactVal})`
      );

      res.json({
        success: true,
        message: "Request berhasil diklasifikasi dan prioritas diperbarui",
        ticket: updatedTicket,
      });
    } catch (error) {
      console.error("Classify request error:", error);
      res.status(500).json({ error: "Terjadi kesalahan server" });
    }
  }
);

// Approve Service Request
v1Router.post("/requests/:id/approve", authenticate, async (req, res) => {
  try {
    const { notes } = req.body;

    const { data: approval } = await supabase
      .from("approval_workflows")
      .select("*, ticket:ticket_id(*)")
      .eq("ticket_id", req.params.id)
      .eq("approver_role", req.user.role)
      .eq("status", "pending")
      .single();

    if (!approval) {
      return res.status(404).json({ error: "Approval tidak ditemukan" });
    }

    await supabase
      .from("approval_workflows")
      .update({
        approver_id: req.user.id,
        status: "approved",
        notes,
        responded_at: new Date(),
      })
      .eq("id", approval.id);

    const { data: allApprovals } = await supabase
      .from("approval_workflows")
      .select("status")
      .eq("ticket_id", req.params.id)
      .order("workflow_level");

    const allApproved = allApprovals?.every((a) => a.status === "approved");

    if (allApproved) {
      await supabase
        .from("tickets")
        .update({ status: "open", updated_at: new Date() })
        .eq("id", req.params.id);
    }

    await logTicketActivity(
      req.params.id,
      req.user.id,
      "approve",
      `Approved by ${req.user.role}. ${notes || ""}`
    );

    res.json({
      success: true,
      message: "Service request berhasil disetujui",
      all_approved: allApproved,
    });
  } catch (error) {
    console.error("Approve request error:", error);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

// Reject Service Request
v1Router.post("/requests/:id/reject", authenticate, async (req, res) => {
  try {
    const { notes } = req.body;

    if (!notes) {
      return res.status(400).json({ error: "Alasan penolakan harus diisi" });
    }

    const { data: approval } = await supabase
      .from("approval_workflows")
      .select("*, ticket:ticket_id(*)")
      .eq("ticket_id", req.params.id)
      .eq("approver_role", req.user.role)
      .eq("status", "pending")
      .single();

    if (!approval) {
      return res.status(404).json({ error: "Approval tidak ditemukan" });
    }

    await supabase
      .from("approval_workflows")
      .update({
        approver_id: req.user.id,
        status: "rejected",
        notes,
        responded_at: new Date(),
      })
      .eq("id", approval.id);

    await supabase
      .from("tickets")
      .update({ status: "rejected", closed_at: new Date() })
      .eq("id", req.params.id);

    await logTicketActivity(
      req.params.id,
      req.user.id,
      "reject",
      `Rejected by ${req.user.role}. Reason: ${notes}`
    );

    res.json({ success: true, message: "Service request berhasil ditolak" });
  } catch (error) {
    console.error("Reject request error:", error);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

// ===========================================
// 10. DASHBOARD ROUTE
// ===========================================
v1Router.get("/dashboard", authenticate, async (req, res) => {
  try {
    const userRole = req.user.role;
    const opdId = req.user.opd_id;

    let ticketFilter = {};

    // Filter Logic
    if (userRole === "pengguna") {
      ticketFilter = { reporter_id: req.user.id };
    } else if (userRole === "teknisi") {
      ticketFilter = { assigned_to: req.user.id };
    } else if (
      ["admin_opd", "bidang", "seksi", "helpdesk"].includes(userRole)
    ) {
      ticketFilter = { opd_id: opdId };
    }

    // 1. Query Data Statistik
    let query = supabase
      .from("tickets")
      .select("status, priority, type, stage"); // Pastikan 'stage' terpanggil

    Object.entries(ticketFilter).forEach(([key, value]) => {
      query = query.eq(key, value);
    });

    const { data: tickets, error } = await query;
    if (error) throw error;

    const totalTickets = tickets.length;

    // --- INISIALISASI COUNTER ---
    const statusCounts = {
      open: 0,
      assigned: 0,
      in_progress: 0,
      resolved: 0,
      closed: 0,
      pending_approval: 0,
    };
    const priorityCounts = {
      low: 0,
      medium: 0,
      high: 0,
      major: 0,
    };

    const stageCounts = {};
    const compositionMap = {};

    // --- LOOPING DATA ---
    tickets.forEach((ticket) => {
      if (statusCounts[ticket.status] !== undefined)
        statusCounts[ticket.status]++;
      if (priorityCounts[ticket.priority] !== undefined)
        priorityCounts[ticket.priority]++;

      if (ticket.stage) {
        if (!stageCounts[ticket.stage]) stageCounts[ticket.stage] = 0;
        stageCounts[ticket.stage]++;
      }

      if (userRole === "teknisi") {
        const currentStage = ticket.stage || "unspecified";
        const key = `${ticket.status}|${currentStage}`;
        if (!compositionMap[key]) {
          compositionMap[key] = {
            status: ticket.status,
            stage: currentStage,
            value: 0,
          };
        }
        compositionMap[key].value++;
      }
    });

    let myTaskCompositionData = [];
    if (userRole === "teknisi") {
      myTaskCompositionData = Object.values(compositionMap);
    }

    // 2. Query Recent Tickets (BAGIAN YANG DIUBAH)
    let listQuery = supabase
      .from("tickets")
      // PERBAIKAN 1: Tambahkan 'id' di select statement ini
      .select(
        "id, ticket_number, title, type, status, stage, priority, updated_at"
      )
      .order("updated_at", { ascending: false })
      .limit(5);

    Object.entries(ticketFilter).forEach(([key, value]) => {
      listQuery = listQuery.eq(key, value);
    });

    const { data: recentTickets } = await listQuery;

    // PERBAIKAN 2: Mapping data agar 'id' (UUID) dan 'ticket_number' terpisah
    const myAssignedTickets = (recentTickets || []).map((t) => ({
      id: t.id, // <--- Ini UUID Database
      ticket_number: t.ticket_number, // <--- Ini Kode Tiket (misal: INC-2025-001)
      title: t.title,
      type: t.type === "incident" ? "Pengaduan" : "Permintaan Layanan",
      status: t.status,
      stage: t.stage,
    }));

    // --- FINAL RESPONSE ---
    res.json({
      success: true,
      dashboard: {
        total_tickets: totalTickets,
        by_status: statusCounts,
        by_priority: priorityCounts,
        by_stage: stageCounts,
        role: userRole,
        scope:
          userRole === "admin_kota"
            ? "All OPD"
            : opdId
            ? `OPD ${opdId}`
            : "Personal",
        task_composition: myTaskCompositionData,
        my_assigned_tickets: myAssignedTickets,
      },
    });
  } catch (error) {
    console.error("Get dashboard error:", error);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

// ===========================================
// 11. SEARCH ROUTE
// ===========================================
v1Router.get("/search", authenticate, async (req, res) => {
  try {
    const { q, type, page = 1, limit = 20 } = req.query;

    if (!q) {
      return res.status(400).json({ error: "Query pencarian harus diisi" });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const results = {};

    // Search tickets
    if (!type || type === "tickets") {
      let ticketQuery = supabase
        .from("tickets")
        .select("id, ticket_number, title, type, status, created_at", {
          count: "exact",
        })
        .or(
          `title.ilike.%${q}%,ticket_number.ilike.%${q}%,description.ilike.%${q}%`
        )
        .range(offset, offset + parseInt(limit) - 1);

      if (req.user.role === "pengguna") {
        ticketQuery = ticketQuery.eq("reporter_id", req.user.id);
      } else if (
        ["admin_opd", "bidang", "seksi", "helpdesk"].includes(req.user.role)
      ) {
        ticketQuery = ticketQuery.eq("opd_id", req.user.opd_id);
      }

      const { data: tickets, count: ticketCount } = await ticketQuery;
      results.tickets = { data: tickets, count: ticketCount };
    }

    // Search KB
    if (!type || type === "kb") {
      const { data: articles, count: kbCount } = await supabase
        .from("o_knowledge_base")
        .select("id, title, category, created_at", { count: "exact" })
        .eq("status", "published")
        .or(`title.ilike.%${q}%,content.ilike.%${q}%`)
        .range(offset, offset + parseInt(limit) - 1);

      results.kb = { data: articles, count: kbCount };
    }

    res.json({
      success: true,
      query: q,
      results,
    });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

// ===========================================
// 12. SYNC ROUTE (Mobile Offline)
// ===========================================
v1Router.post("/sync", authenticate, async (req, res) => {
  try {
    const { tickets, progress_updates } = req.body;

    const results = {
      tickets: [],
      progress_updates: [],
      errors: [],
    };

    // Sync tickets
    if (tickets && Array.isArray(tickets)) {
      for (const ticket of tickets) {
        try {
          const ticketNumber = generateTicketNumber(ticket.type || "incident");
          const { data } = await supabase
            .from("tickets")
            .insert({
              ...ticket,
              ticket_number: ticketNumber,
              reporter_id: req.user.id,
              created_at: ticket.created_at || new Date(),
            })
            .select()
            .single();

          results.tickets.push({
            local_id: ticket.local_id,
            server_id: data.id,
            ticket_number: ticketNumber,
          });
        } catch (error) {
          results.errors.push({
            type: "ticket",
            local_id: ticket.local_id,
            error: error.message,
          });
        }
      }
    }

    // Sync progress updates
    if (progress_updates && Array.isArray(progress_updates)) {
      for (const update of progress_updates) {
        try {
          const { data } = await supabase
            .from("ticket_progress_updates")
            .insert({
              ...update,
              updated_by: req.user.id,
              created_at: update.created_at || new Date(),
            })
            .select()
            .single();

          results.progress_updates.push({
            local_id: update.local_id,
            server_id: data.id,
          });
        } catch (error) {
          results.errors.push({
            type: "progress_update",
            local_id: update.local_id,
            error: error.message,
          });
        }
      }
    }

    res.json({
      success: true,
      message: "Sinkronisasi selesai",
      results,
    });
  } catch (error) {
    console.error("Sync error:", error);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

// ===========================================
// 13. ADMIN OPERATIONS ROUTES
// ===========================================
v1Router.get(
  "/admin/roles",
  authenticate,
  authorize("rbac.manage"),
  async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("roles_config")
        .select("*")
        .order("role_key");

      if (error) throw error;
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Get OPDs
v1Router.get(
  "/admin/opd",
  authenticate,
  authorize("opd.read"),
  async (req, res) => {
    try {
      const { is_active, page = 1, limit = 20 } = req.query;

      const offset = (parseInt(page) - 1) * parseInt(limit);

      let query = supabase
        .from("opd")
        .select("*", { count: "exact" })
        .order("name")
        .range(offset, offset + parseInt(limit) - 1);

      if (is_active !== undefined)
        query = query.eq("is_active", is_active === "true");

      const { data, count, error } = await query;
      if (error) throw error;

      res.json({
        success: true,
        data,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          total_pages: Math.ceil(count / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error("Get OPD error:", error);
      res.status(500).json({ error: "Terjadi kesalahan server" });
    }
  }
);

// Get Technicians by OPD
v1Router.get("/admin/opd/:id/technicians", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("users")
      .select("id, username, full_name, email, phone, is_active")
      .eq("opd_id", id)
      .eq("role", "teknisi")
      .eq("is_active", true);

    if (error) throw error;

    res.json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    console.error("Get technicians error:", error);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});
// Get Pegawai by OPD
v1Router.get(
  "/admin/opd/:id/pegawai",
  authenticate,
  authorize("users.read"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const { data, error } = await supabase
        .from("users")
        .select(
          "id, username, full_name, email, phone, nip, address, is_active"
        ) // <-- Tambah 'address' disini
        .eq("opd_id", id)
        .eq("role", "pegawai_opd")
        .order("full_name");

      if (error) throw error;

      res.json({
        success: true,
        data: data || [],
      });
    } catch (error) {
      console.error("Get OPD employees error:", error);
      res.status(500).json({ error: "Terjadi kesalahan server" });
    }
  }
);
// Update OPD Calendar
v1Router.put(
  "/admin/opd/:id/calendar",
  authenticate,
  authorize("opd.write"),
  async (req, res) => {
    try {
      const { working_hours, holidays } = req.body;

      const updateData = {};
      if (working_hours) updateData.working_hours = working_hours;
      if (holidays) updateData.holidays = holidays;

      const { data, error } = await supabase
        .from("opd")
        .update(updateData)
        .eq("id", req.params.id)
        .select()
        .single();

      if (error) throw error;

      res.json({
        success: true,
        message: "Kalender OPD berhasil diperbarui",
        opd: data,
      });
    } catch (error) {
      console.error("Update OPD calendar error:", error);
      res.status(500).json({ error: "Terjadi kesalahan server" });
    }
  }
);

// Update Technician Skills
v1Router.put(
  "/admin/technicians/:id/skills",
  authenticate,
  authorize("users.write"),
  async (req, res) => {
    try {
      const { skills, expertise_level, certifications } = req.body;

      if (!skills || !Array.isArray(skills)) {
        return res.status(400).json({ error: "Skills harus berupa array" });
      }

      // Delete existing skills
      await supabase
        .from("technician_skills")
        .delete()
        .eq("user_id", req.params.id);

      // Insert new skills
      const skillsData = skills.map((skill) => ({
        user_id: req.params.id,
        skill_name: skill.name,
        skill_level: skill.level || "intermediate",
        category: skill.category,
      }));

      const { data, error } = await supabase
        .from("technician_skills")
        .insert(skillsData)
        .select();

      if (error) throw error;

      // Update user record
      await supabase
        .from("users")
        .update({
          expertise_level,
          certifications,
        })
        .eq("id", req.params.id);

      res.json({
        success: true,
        message: "Skills teknisi berhasil diperbarui",
        skills: data,
      });
    } catch (error) {
      console.error("Update technician skills error:", error);
      res.status(500).json({ error: "Terjadi kesalahan server" });
    }
  }
);
// UPSERT SLA CONFIGURATION (UPDATED)
v1Router.post(
  "/admin/sla",
  authenticate,
  authorize("opd.write"),
  async (req, res) => {
    try {
      const { opd_id, configs } = req.body;

      // Validasi input
      if (!opd_id || !Array.isArray(configs)) {
        return res
          .status(400)
          .json({ error: "Format data salah. 'configs' harus array." });
      }

      // Mapping data untuk disimpan ke DB
      const upsertData = configs.map((c) => ({
        opd_id,
        priority: c.priority,
        resolution_time: c.resolution_time, // Tetap angka (Jam) untuk hitung SLA_DUE
        description: c.description, // GANTI: Teks deskripsi SLA Respon
        ticket_type: "incident", // Default
      }));

      const { data, error } = await supabase
        .from("sla")
        .upsert(upsertData, { onConflict: "opd_id, priority" })
        .select();

      if (error) throw error;

      res.json({
        success: true,
        message: "Konfigurasi SLA berhasil disimpan",
        data,
      });
    } catch (error) {
      console.error("SLA Config Error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);
// Get SLA Configuration
v1Router.get(
  "/admin/sla",
  authenticate,
  authorize("opd.read"),
  async (req, res) => {
    try {
      // 1. Ambil opd_id dari query params.
      // Jika yang request adalah admin_opd, bisa dipaksa pakai req.user.opd_id agar aman.
      let targetOpdId = req.query.opd_id;

      if (req.user.role === "admin_opd") {
        targetOpdId = req.user.opd_id;
      }

      if (!targetOpdId) {
        return res
          .status(400)
          .json({ error: "Parameter opd_id wajib diisi (untuk super admin)" });
      }

      const { data, error } = await supabase
        .from("sla")
        .select("*")
        .eq("opd_id", targetOpdId)
        .order("id", { ascending: true });

      if (error) throw error;

      res.json({
        success: true,
        data: data || [],
      });
    } catch (error) {
      console.error("Get SLA error:", error);
      res.status(500).json({ error: "Terjadi kesalahan server" });
    }
  }
);
// ===========================================
// 14. QR CODE SCANNING ROUTE
// ===========================================
v1Router.get("/assets/qr/:qr_code", authenticate, async (req, res) => {
  try {
    const qrCode = req.params.qr_code;
    const userRole = req.user.role;

    const { data: asset, error } = await supabase
      .from("assets")
      .select(
        `
        *,
        opd:opd_id(id, name),
        location:location_id(id, name, address)
      `
      )
      .eq("qr_code", qrCode)
      .single();

    if (error || !asset) {
      return res.status(404).json({ error: "Asset tidak ditemukan" });
    }

    if (userRole === "pengguna") {
      res.json({
        success: true,
        action: "create_ticket",
        message: "Gunakan informasi ini untuk membuat tiket",
        asset: {
          id: asset.id,
          name: asset.name,
          type: asset.asset_type,
          location: asset.location?.name,
          opd: asset.opd?.name,
        },
      });
    } else if (userRole === "teknisi") {
      await supabase.from("technician_check_ins").insert({
        technician_id: req.user.id,
        asset_id: asset.id,
        check_in_time: new Date(),
        qr_code: qrCode,
      });

      res.json({
        success: true,
        action: "technician_check_in",
        message: "Check-in berhasil",
        asset: {
          id: asset.id,
          name: asset.name,
          type: asset.asset_type,
        },
      });
    } else {
      res.status(403).json({ error: "Role tidak valid untuk scan QR" });
    }
  } catch (error) {
    console.error("QR scan error:", error);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

// ===========================================
// 15. COMMENTS ROUTES
// ===========================================
// Add Comment to Incident
v1Router.post("/incidents/:id/comments", authenticate, async (req, res) => {
  try {
    const { content, is_internal } = req.body;

    if (!content) {
      return res.status(400).json({ error: "Konten komentar harus diisi" });
    }

    const { data, error } = await supabase
      .from("ticket_comments")
      .insert({
        ticket_id: req.params.id,
        user_id: req.user.id,
        content,
        is_internal: is_internal || false,
      })
      .select(`*, user:user_id(id, username, full_name, role)`)
      .single();

    if (error) throw error;

    await logTicketActivity(
      req.params.id,
      req.user.id,
      "comment",
      is_internal ? "Added internal note" : "Added comment"
    );

    res.status(201).json({
      success: true,
      message: "Komentar berhasil ditambahkan",
      comment: data,
    });
  } catch (error) {
    console.error("Add comment error:", error);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

// Add Comment to Request
v1Router.post("/requests/:id/comments", authenticate, async (req, res) => {
  try {
    const { content, is_internal } = req.body;

    if (!content) {
      return res.status(400).json({ error: "Konten komentar harus diisi" });
    }

    const { data, error } = await supabase
      .from("ticket_comments")
      .insert({
        ticket_id: req.params.id,
        user_id: req.user.id,
        content,
        is_internal: is_internal || false,
      })
      .select(`*, user:user_id(id, username, full_name, role)`)
      .single();

    if (error) throw error;

    await logTicketActivity(
      req.params.id,
      req.user.id,
      "comment",
      is_internal ? "Added internal note" : "Added comment"
    );

    res.status(201).json({
      success: true,
      message: "Komentar berhasil ditambahkan",
      comment: data,
    });
  } catch (error) {
    console.error("Add comment error:", error);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

// ===========================================
// 16. PROGRESS UPDATES ROUTES
// ===========================================
// Add Progress Update to Incident
v1Router.post(
  "/incidents/:id/progress",
  authenticate,
  authorize("tickets.update_progress"),
  async (req, res) => {
    try {
      const {
        update_number,
        status_change,
        stage_change,
        reason,
        problem_detail,
        handling_description,
        final_solution,
      } = req.body;

      // 1. Validasi Input Dasar
      if (!update_number || !status_change) {
        return res
          .status(400)
          .json({ error: "Update number dan status harus diisi" });
      }

      const logDescription = stage_change
        ? `[Stage: ${stage_change}] ${handling_description || ""}`
        : handling_description;

      const { data: progressUpdate, error } = await supabase
        .from("ticket_progress_updates")
        .insert({
          ticket_id: req.params.id,
          update_number: parseInt(update_number),
          updated_by: req.user.id,
          status_change,
          reason,
          problem_detail,
          handling_description: logDescription,
          final_solution,
        })
        .select()
        .single();

      if (error) throw error;

      // 3. Logic Update Status & Stage di Tabel Utama (Tickets)
      let updatePayload = {
        updated_at: new Date(),
      };

      // A. Update Stage (Jika dikirim frontend)
      if (stage_change) {
        updatePayload.stage = stage_change;
      }

      // B. Mapping Status (Agar sesuai constraint DB)
      const statusInput = status_change.toLowerCase();

      if (["resolved", "selesai", "ditutup"].includes(statusInput)) {
        updatePayload.status = "resolved";
        updatePayload.resolution = final_solution;
        updatePayload.resolved_at = new Date();
        updatePayload.stage = "finished"; // Reset stage jika selesai
      } else if (["closed"].includes(statusInput)) {
        updatePayload.status = "closed";
        updatePayload.closed_at = new Date();
      } else if (
        ["in_progress", "proses", "dikerjakan"].includes(statusInput)
      ) {
        updatePayload.status = "in_progress";
        // Stage tetap sesuai kiriman frontend (misal: 'execution' atau 'analysis')
      } else if (["assigned", "ditugaskan"].includes(statusInput)) {
        updatePayload.status = "assigned";
        // Stage bisa jadi 'verification' atau 'revision' tergantung frontend
      } else if (["pending_approval", "menunggu"].includes(statusInput)) {
        updatePayload.status = "pending_approval";
      }

      // C. Eksekusi Update ke Database
      if (updatePayload.status) {
        const { error: updateError } = await supabase
          .from("tickets")
          .update(updatePayload)
          .eq("id", req.params.id);

        if (updateError) throw updateError;
      }

      // 4. Log Activity System
      await logTicketActivity(
        req.params.id,
        req.user.id,
        "progress_update",
        `Update ${update_number}: ${status_change} ${
          stage_change ? `(${stage_change})` : ""
        }`
      );

      res.status(201).json({
        success: true,
        message: "Progress update berhasil disimpan",
        data: {
          progress: progressUpdate,
          current_state: {
            status: updatePayload.status,
            stage: updatePayload.stage,
          },
        },
      });
    } catch (error) {
      console.error("Update incident progress error:", error);
      res.status(500).json({ error: "Terjadi kesalahan server" });
    }
  }
);

// Add Progress Update to Request
v1Router.post(
  "/requests/:id/progress",
  authenticate,
  authorize("tickets.update_progress"),
  async (req, res) => {
    try {
      const {
        update_number,
        status_change,
        stage_change, // BARU
        notes,
      } = req.body;

      if (!update_number || !status_change) {
        return res
          .status(400)
          .json({ error: "Update number dan status harus diisi" });
      }

      // 1. Simpan Log
      const logDescription = stage_change
        ? `[Stage: ${stage_change}] ${notes || ""}`
        : notes;

      const { data: progressUpdate, error } = await supabase
        .from("ticket_progress_updates")
        .insert({
          ticket_id: req.params.id,
          update_number: parseInt(update_number),
          updated_by: req.user.id,
          status_change,
          handling_description: logDescription,
        })
        .select()
        .single();

      if (error) throw error;

      // 2. Update Status & Stage Utama
      let updatePayload = { updated_at: new Date() };

      // A. Update Stage
      if (stage_change) {
        updatePayload.stage = stage_change;
      }

      // B. Mapping Status
      const statusInput = status_change.toLowerCase();

      if (["resolved", "selesai"].includes(statusInput)) {
        updatePayload.status = "resolved";
        updatePayload.resolved_at = new Date();
        updatePayload.stage = "finished";
      } else if (["in_progress", "proses"].includes(statusInput)) {
        updatePayload.status = "in_progress";
      } else if (["pending_approval"].includes(statusInput)) {
        updatePayload.status = "pending_approval";
      } else if (["assigned"].includes(statusInput)) {
        updatePayload.status = "assigned";
      }

      // C. Eksekusi Update
      if (updatePayload.status) {
        await supabase
          .from("tickets")
          .update(updatePayload)
          .eq("id", req.params.id);
      }

      await logTicketActivity(
        req.params.id,
        req.user.id,
        "progress_update",
        `Request Update ${update_number}: ${status_change}`
      );

      res.status(201).json({
        success: true,
        message: "Progress request berhasil ditambahkan",
        data: {
          progress: progressUpdate,
          current_state: {
            status: updatePayload.status,
            stage: updatePayload.stage,
          },
        },
      });
    } catch (error) {
      console.error("Update request progress error:", error);
      res.status(500).json({ error: "Terjadi kesalahan server" });
    }
  }
);

// ===========================================
// 17. AUDIT LOGS ROUTE
// ===========================================
v1Router.get(
  "/admin/audit-logs",
  authenticate,
  authorize("reports.read"),
  async (req, res) => {
    try {
      const {
        user_id,
        action,
        date_from,
        date_to,
        page = 1,
        limit = 100,
      } = req.query;

      const offset = (parseInt(page) - 1) * parseInt(limit);

      let query = supabase
        .from("ticket_logs")
        .select(
          `
        *,
        user:user_id(id, username, full_name, role),
        ticket:ticket_id(ticket_number, title)
      `,
          { count: "exact" }
        )
        .order("created_at", { ascending: false })
        .range(offset, offset + parseInt(limit) - 1);

      if (user_id) query = query.eq("user_id", user_id);
      if (action) query = query.eq("action", action);
      if (date_from) query = query.gte("created_at", date_from);
      if (date_to) query = query.lte("created_at", date_to);

      const { data, count, error } = await query;
      if (error) throw error;

      res.json({
        success: true,
        data,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          total_pages: Math.ceil(count / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error("Get audit logs error:", error);
      res.status(500).json({ error: "Terjadi kesalahan server" });
    }
  }
);
// ===========================================
// 18. KNOWLEDGE BASE ROUTES (UPDATED FROM VIBER EXPRESS)
// ===========================================
// NOTE: Menggunakan tabel 'o_knowledge_base' sesuai struktur baru
// Endpoint ini menggantikan implementasi KB lama yang sederhana.

// Get All KB (With Filters)
v1Router.get("/knowledge-base", authenticate, async (req, res) => {
  try {
    const { active, category, search } = req.query;
    let query = supabase
      .from("o_knowledge_base")
      .select("*")
      .order("created_at", { ascending: false });

    if (search) {
      query = query.or(
        `judul_kb.ilike.%${search}%,deskripsi_kb.ilike.%${search}%`
      );
    }

    if (category) {
      query = query.eq("kategori_kb", category);
    }

    if (active === "true") {
      query = query.eq("is_active", 1);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, error: error.message });
  }
});

// Get KB by ID
v1Router.get("/knowledge-base/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("o_knowledge_base")
      .select("*")
      .eq("id_kb", id)
      .single();

    if (error) throw error;
    if (!data) {
      return res
        .status(404)
        .json({ status: false, error: "Knowledge base tidak ditemukan" });
    }

    res.status(200).json({ status: true, data });
  } catch (error) {
    res.status(500).json({ status: false, error: error.message });
  }
});

// Create KB (Protected)
v1Router.post(
  "/knowledge-base",
  authenticate,
  authorize("kb.write"),
  async (req, res) => {
    try {
      const { judul_kb, kategori_kb, deskripsi_kb } = req.body;

      if (!judul_kb || !deskripsi_kb) {
        return res
          .status(400)
          .json({ status: false, error: "Judul dan deskripsi wajib diisi" });
      }

      const { data, error } = await supabase
        .from("o_knowledge_base")
        .insert({
          judul_kb,
          kategori_kb,
          deskripsi_kb,
          created_by: req.user.id,
          is_active: 1,
        })
        .select("*")
        .single();

      if (error) throw error;

      res.status(201).json({
        status: true,
        message: "Knowledge base berhasil dibuat",
        data,
      });
    } catch (error) {
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Update KB
v1Router.put(
  "/knowledge-base/:id",
  authenticate,
  authorize("kb.write"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { judul_kb, kategori_kb, deskripsi_kb, is_active } = req.body;

      const updateData = {
        updated_at: new Date().toISOString(),
        updated_by: req.user.id,
      };

      if (judul_kb !== undefined) updateData.judul_kb = judul_kb;
      if (kategori_kb !== undefined) updateData.kategori_kb = kategori_kb;
      if (deskripsi_kb !== undefined) updateData.deskripsi_kb = deskripsi_kb;
      if (is_active !== undefined) updateData.is_active = is_active;

      const { data, error } = await supabase
        .from("o_knowledge_base")
        .update(updateData)
        .eq("id_kb", id)
        .select("*")
        .single();

      if (error) throw error;

      res.status(200).json({
        status: true,
        message: "Knowledge base berhasil diupdate",
        data,
      });
    } catch (error) {
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Soft Delete KB (Deactivate)
v1Router.patch(
  "/knowledge-base/:id/deactivate",
  authenticate,
  authorize("kb.write"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { data, error } = await supabase
        .from("o_knowledge_base")
        .update({
          is_active: 0,
          updated_by: req.user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id_kb", id)
        .select("*")
        .single();

      if (error) throw error;

      res.status(200).json({
        status: true,
        message: "Knowledge base berhasil dinonaktifkan",
        data,
      });
    } catch (error) {
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Hard Delete KB
v1Router.delete(
  "/knowledge-base/:id",
  authenticate,
  authorize("kb.write"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { error } = await supabase
        .from("o_knowledge_base")
        .delete()
        .eq("id_kb", id);

      if (error) throw error;

      res.status(200).json({
        status: true,
        message: "Knowledge base berhasil dihapus permanen",
      });
    } catch (error) {
      res.status(500).json({ status: false, error: error.message });
    }
  }
);
// ===========================================
// 19. SURVEY ROUTES (NEW FROM VIBER EXPRESS)
// ===========================================
// NOTE: Menggunakan tabel 'o_ticket_surveys' sesuai struktur baru
// Get All Surveys (Admin Only)
v1Router.get(
  "/surveys",
  authenticate,
  authorize("reports.read"),
  async (req, res) => {
    try {
      // Ambil semua surveys
      const { data: surveysData, error: surveysError } = await supabase
        .from("o_ticket_surveys")
        .select("*")
        .order("created_at", { ascending: false });

      if (surveysError) throw surveysError;

      // Fetch data tiket terkait untuk detail
      if (surveysData && surveysData.length > 0) {
        const ticketIds = surveysData.map((s) => s.ticket_id);
        const { data: ticketData } = await supabase
          .from("tickets")
          .select("*")
          .in("id", ticketIds);

        // Join manual
        const result = surveysData.map((survey) => {
          const ticket = ticketData
            ? ticketData.find((t) => t.id === survey.ticket_id)
            : null;
          return { ...survey, ticket: ticket || null };
        });
        return res.status(200).json({ status: true, data: result });
      }

      res.status(200).json({ status: true, data: surveysData });
    } catch (err) {
      res.status(500).json({ status: false, error: err.message });
    }
  }
);

// Get My Surveys
v1Router.get("/surveys/my-surveys", authenticate, async (req, res) => {
  try {
    const { data: surveys, error } = await supabase
      .from("o_ticket_surveys")
      .select("*")
      .eq("created_by", req.user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Optional: Join with tickets details if needed
    if (surveys && surveys.length > 0) {
      const ticketIds = surveys.map((s) => s.ticket_id).filter(Boolean);
      if (ticketIds.length > 0) {
        const { data: tickets } = await supabase
          .from("tickets")
          .select("*")
          .in("id", ticketIds);
        surveys.forEach((survey) => {
          survey.ticket =
            tickets?.find((t) => t.id === survey.ticket_id) || null;
        });
      }
    }

    res.json({ success: true, data: surveys });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check if user already submitted survey for ticket
v1Router.get("/surveys/check/:ticket_id", authenticate, async (req, res) => {
  try {
    const { ticket_id } = req.params;
    const { data } = await supabase
      .from("o_ticket_surveys")
      .select("id_surveys")
      .eq("ticket_id", ticket_id)
      .maybeSingle();

    res.json({ success: true, hasSurvey: data !== null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Survey By ID
v1Router.get("/surveys/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: survey, error } = await supabase
      .from("o_ticket_surveys")
      .select("*")
      .eq("id_surveys", id)
      .single();

    if (error) throw error;
    if (!survey) {
      return res
        .status(404)
        .json({ status: false, error: "Survey tidak ditemukan" });
    }

    // Fetch ticket detail
    if (survey.ticket_id) {
      const { data: ticket } = await supabase
        .from("tickets")
        .select("*")
        .eq("id", survey.ticket_id)
        .single();
      survey.ticket = ticket || null;
    }

    res.json({ status: true, data: survey });
  } catch (error) {
    res.status(500).json({ status: false, error: error.message });
  }
});

// Submit Survey
v1Router.post("/surveys", authenticate, async (req, res) => {
  try {
    const { ticket_id, rating, feedback, category } = req.body;

    // Check existing
    const { data: existing } = await supabase
      .from("o_ticket_surveys")
      .select("id_surveys")
      .eq("ticket_id", ticket_id)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ error: "Tiket ini sudah memiliki survey" });
    }

    const { data: survey, error } = await supabase
      .from("o_ticket_surveys")
      .insert({
        ticket_id: ticket_id,
        created_by: req.user.id,
        rating,
        feedback,
        category,
      })
      .select("*")
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: "Survey berhasil disubmit",
      data: survey,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Get All Articles
v1Router.get("/articles", authenticate, async (req, res) => {
  try {
    const {
      kategori_artikel,
      target_pembaca,
      kata_kunci,
      id_ticket,
      created_by,
      is_active,
    } = req.query;

    let query = supabase
      .from("o_ticket_articles")
      .select(
        `
      *,
      creator:created_by (
        id, username, full_name
      ),
      ticket:id_ticket (
        id, ticket_number, title, status
      )
    `
      )
      .order("created_at", { ascending: false });

    // Apply filters
    if (kategori_artikel)
      query = query.eq("kategori_artikel", kategori_artikel);
    if (target_pembaca) query = query.eq("target_pembaca", target_pembaca);
    if (kata_kunci) query = query.ilike("kata_kunci", `%${kata_kunci}%`);
    if (id_ticket) query = query.eq("id_ticket", id_ticket);
    if (created_by) query = query.eq("created_by", created_by);
    if (is_active !== undefined) {
      query = query.eq("is_active", is_active === "true");
    } else {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({
      status: true,
      message: "Articles retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Get articles error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Get Article Categories
v1Router.get("/articles/categories", authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("o_ticket_articles")
      .select("kategori_artikel")
      .eq("is_active", true);

    if (error) throw error;

    const categories = [
      ...new Set(data.map((item) => item.kategori_artikel)),
    ].filter(Boolean);

    res.json({
      status: true,
      message: "Categories retrieved successfully",
      data: categories,
    });
  } catch (error) {
    console.error("Get categories error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Get Article Statistics
v1Router.get("/articles/stats", authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("o_ticket_articles")
      .select("id_artikel, kategori_artikel, target_pembaca")
      .eq("is_active", true);

    if (error) throw error;

    const stats = {
      total: data.length,
      byCategory: {},
      byTargetPembaca: {},
    };

    data.forEach((article) => {
      if (article.kategori_artikel) {
        stats.byCategory[article.kategori_artikel] =
          (stats.byCategory[article.kategori_artikel] || 0) + 1;
      }
      if (article.target_pembaca) {
        stats.byTargetPembaca[article.target_pembaca] =
          (stats.byTargetPembaca[article.target_pembaca] || 0) + 1;
      }
    });

    res.json({
      status: true,
      message: "Statistics retrieved successfully",
      data: stats,
    });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Get Articles by Category
v1Router.get("/articles/category/:kategori", authenticate, async (req, res) => {
  try {
    const { kategori } = req.params;

    const { data, error } = await supabase
      .from("o_ticket_articles")
      .select(
        `
      *,
      creator:created_by (
        id, username, full_name
      )
    `
      )
      .eq("is_active", true)
      .eq("kategori_artikel", kategori)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({
      status: true,
      message: "Articles retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Get articles by category error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Search Articles
v1Router.get("/articles/search", authenticate, async (req, res) => {
  try {
    const { keyword } = req.query;

    if (!keyword) {
      return res
        .status(400)
        .json({ status: false, error: "Keyword is required" });
    }

    const { data, error } = await supabase
      .from("o_ticket_articles")
      .select(
        `
      *,
      creator:created_by (
        id, username, full_name
      ),
      ticket:id_ticket (
        id, ticket_number, title
      )
    `
      )
      .eq("is_active", true)
      .or(
        `judul_artikel.ilike.%${keyword}%,deskripsi_artikel.ilike.%${keyword}%,kata_kunci.ilike.%${keyword}%,penyelesaian.ilike.%${keyword}%,penyebab.ilike.%${keyword}%`
      )
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({ status: true, message: "Articles searched successfully", data });
  } catch (error) {
    console.error("Search articles error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Get Article by ID or Custom ID
v1Router.get("/articles/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Base Query
    let query = supabase.from("o_ticket_articles").select(`
        *,
        ticket:id_ticket (
          id, ticket_number, title, description, status, priority, category
        )
      `);

    // Logic penentuan ID (Angka vs String)
    if (!isNaN(id)) {
      // Jika ID berupa angka (misal: 2), cari berdasarkan Primary Key
      query = query.eq("id_artikel", id);
    } else {
      // Jika ID berupa string (misal: ART-001), cari custom_id
      query = query.eq("custom_id", id);
    }

    // --- PERBAIKAN DI SINI ---
    // Tambahkan .limit(1) agar jika ada data ganda, tidak error 500
    const { data, error } = await query.limit(1).single();

    if (error) throw error;

    if (!data) {
      return res
        .status(404)
        .json({ status: false, error: "Article not found" });
    }

    res.json({ status: true, message: "Article retrieved successfully", data });
  } catch (error) {
    console.error("Get article by ID error:", error);
    // Handle error spesifik "Row not found" dari Supabase
    if (error.code === "PGRST116") {
      res.status(404).json({ status: false, error: "Article not found" });
    } else {
      res.status(500).json({ status: false, error: error.message });
    }
  }
});

// Get Articles by Ticket ID
v1Router.get("/tickets/:ticketId/articles", authenticate, async (req, res) => {
  try {
    const { ticketId } = req.params;

    const { data, error } = await supabase
      .from("o_ticket_articles")
      .select(
        `
      *,
      creator:created_by (
        id, username, full_name
      )
    `
      )
      .eq("id_ticket", ticketId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({
      status: true,
      message: "Articles retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Get articles by ticket error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Create Article
v1Router.post(
  "/articles",
  authenticate,
  authorize("kb.write"),
  async (req, res) => {
    try {
      const {
        id_ticket,
        judul_artikel,
        kategori_artikel,
        target_pembaca,
        kata_kunci,
        deskripsi_artikel,
        penyebab,
        penyelesaian,
        lampiran,
      } = req.body;

      // Validation
      if (
        !judul_artikel ||
        !kategori_artikel ||
        !target_pembaca ||
        !kata_kunci ||
        !deskripsi_artikel ||
        !penyelesaian
      ) {
        return res
          .status(400)
          .json({ status: false, error: "Missing required fields" });
      }

      const { data, error } = await supabase
        .from("o_ticket_articles")
        .insert({
          id_ticket,
          judul_artikel,
          kategori_artikel,
          target_pembaca,
          kata_kunci,
          deskripsi_artikel,
          penyebab,
          penyelesaian,
          lampiran,
          created_by: req.user.id,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      res
        .status(201)
        .json({ status: true, message: "Article created successfully", data });
    } catch (error) {
      console.error("Create article error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Update Article
v1Router.put(
  "/articles/:id",
  authenticate,
  authorize("kb.write"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const allowedFields = [
        "id_ticket",
        "judul_artikel",
        "kategori_artikel",
        "target_pembaca",
        "kata_kunci",
        "deskripsi_artikel",
        "penyebab",
        "penyelesaian",
        "lampiran",
      ];

      const updateData = {};
      allowedFields.forEach((field) => {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      });

      const { data, error } = await supabase
        .from("o_ticket_articles")
        .update(updateData)
        .eq("id_artikel", id)
        .select()
        .single();

      if (error) throw error;

      res.json({ status: true, message: "Article updated successfully", data });
    } catch (error) {
      console.error("Update article error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Delete Article (Soft Delete)
v1Router.delete(
  "/articles/:id",
  authenticate,
  authorize("kb.write"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const { data, error } = await supabase
        .from("o_ticket_articles")
        .update({ is_active: false })
        .eq("id_artikel", id)
        .select()
        .single();

      if (error) throw error;

      res.json({ status: true, message: "Article deleted successfully", data });
    } catch (error) {
      console.error("Delete article error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// ===========================================
// SECTION 24: DATABASE NOTIFICATIONS ROUTES (NO WHATSAPP)
// ===========================================

// Get User Notifications
v1Router.get("/notifications/users/:userId", authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    // Authorization check
    if (
      req.user.id !== parseInt(userId) &&
      !["admin_kota", "admin_opd", "helpdesk"].includes(req.user.role)
    ) {
      return res.status(403).json({ status: false, error: "Access denied" });
    }

    const { data, error } = await supabase
      .from("notifications")
      .select(
        `
        *,
        ticket:related_ticket_id (
          id, ticket_number, title, status, priority
        )
      `
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    res.json({
      status: true,
      message: "Notifications retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Get Notifications by Type
v1Router.get(
  "/notifications/users/:userId/type/:type",
  authenticate,
  async (req, res) => {
    try {
      const { userId, type } = req.params;
      const limit = parseInt(req.query.limit) || 50;

      // Authorization check
      if (
        req.user.id !== parseInt(userId) &&
        !["admin_kota", "admin_opd", "helpdesk"].includes(req.user.role)
      ) {
        return res.status(403).json({ status: false, error: "Access denied" });
      }

      const validTypes = ["info", "warning", "error", "success"];
      if (!validTypes.includes(type)) {
        return res.status(400).json({
          status: false,
          error: `Invalid type. Must be one of: ${validTypes.join(", ")}`,
        });
      }

      const { data, error } = await supabase
        .from("notifications")
        .select(
          `
        *,
        ticket:related_ticket_id (
          id, ticket_number, title, status
        )
      `
        )
        .eq("user_id", userId)
        .eq("type", type)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      res.json({
        status: true,
        message: `Notifications of type '${type}' retrieved successfully`,
        data,
      });
    } catch (error) {
      console.error("Get notifications by type error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Get Unread Count
v1Router.get(
  "/notifications/users/:userId/unread",
  authenticate,
  async (req, res) => {
    try {
      const { userId } = req.params;

      // Authorization check
      if (
        req.user.id !== parseInt(userId) &&
        !["admin_kota", "admin_opd", "helpdesk"].includes(req.user.role)
      ) {
        return res.status(403).json({ status: false, error: "Access denied" });
      }

      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false);

      if (error) throw error;

      res.json({
        status: true,
        message: "Unread count retrieved successfully",
        data: { count },
      });
    } catch (error) {
      console.error("Get unread count error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Mark Notification as Read
v1Router.put(
  "/notifications/:notificationId/read",
  authenticate,
  async (req, res) => {
    try {
      const { notificationId } = req.params;

      // Get notification to check ownership
      const { data: notification } = await supabase
        .from("notifications")
        .select("user_id")
        .eq("id", notificationId)
        .single();

      if (!notification) {
        return res
          .status(404)
          .json({ status: false, error: "Notification not found" });
      }

      // Authorization check
      if (
        req.user.id !== notification.user_id &&
        !["admin_kota", "admin_opd", "helpdesk"].includes(req.user.role)
      ) {
        return res.status(403).json({ status: false, error: "Access denied" });
      }

      const { data, error } = await supabase
        .from("notifications")
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq("id", notificationId)
        .select()
        .single();

      if (error) throw error;

      res.json({ status: true, message: "Notification marked as read", data });
    } catch (error) {
      console.error("Mark as read error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Mark All as Read
v1Router.put(
  "/notifications/users/:userId/read-all",
  authenticate,
  async (req, res) => {
    try {
      const { userId } = req.params;

      // Authorization check
      if (
        req.user.id !== parseInt(userId) &&
        !["admin_kota", "admin_opd", "helpdesk"].includes(req.user.role)
      ) {
        return res.status(403).json({ status: false, error: "Access denied" });
      }

      const { data, error } = await supabase
        .from("notifications")
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("is_read", false)
        .select();

      if (error) throw error;

      res.json({
        status: true,
        message: `All notifications marked as read (${data.length} updated)`,
        data,
      });
    } catch (error) {
      console.error("Mark all as read error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Delete Notification
v1Router.delete(
  "/notifications/:notificationId",
  authenticate,
  async (req, res) => {
    try {
      const { notificationId } = req.params;

      // Get notification to check ownership
      const { data: notification } = await supabase
        .from("notifications")
        .select("user_id")
        .eq("id", notificationId)
        .single();

      if (!notification) {
        return res
          .status(404)
          .json({ status: false, error: "Notification not found" });
      }

      // Authorization check
      if (
        req.user.id !== notification.user_id &&
        !["admin_kota", "admin_opd", "helpdesk"].includes(req.user.role)
      ) {
        return res.status(403).json({ status: false, error: "Access denied" });
      }

      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", notificationId);

      if (error) throw error;

      res.json({ status: true, message: "Notification deleted successfully" });
    } catch (error) {
      console.error("Delete notification error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Get Notification by ID
v1Router.get(
  "/notifications/:notificationId",
  authenticate,
  async (req, res) => {
    try {
      const { notificationId } = req.params;

      const { data, error } = await supabase
        .from("notifications")
        .select(
          `
        *,
        user:user_id (
          id, username, full_name, email
        ),
        ticket:related_ticket_id (
          id, ticket_number, title, status, priority
        )
      `
        )
        .eq("id", notificationId)
        .single();

      if (error) throw error;

      // Authorization check
      if (
        req.user.id !== data.user_id &&
        !["admin_kota", "admin_opd", "helpdesk"].includes(req.user.role)
      ) {
        return res.status(403).json({ status: false, error: "Access denied" });
      }

      res.json({
        status: true,
        message: "Notification retrieved successfully",
        data,
      });
    } catch (error) {
      console.error("Get notification error:", error);
      if (error.code === "PGRST116") {
        res
          .status(404)
          .json({ status: false, error: "Notification not found" });
      } else {
        res.status(500).json({ status: false, error: error.message });
      }
    }
  }
);

// Get Notifications by Ticket
v1Router.get(
  "/tickets/:ticketId/notifications",
  authenticate,
  async (req, res) => {
    try {
      const { ticketId } = req.params;

      const { data, error } = await supabase
        .from("notifications")
        .select(
          `
        *,
        user:user_id (
          id, username, full_name
        )
      `
        )
        .eq("related_ticket_id", ticketId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      res.json({
        status: true,
        message: "Ticket notifications retrieved successfully",
        data,
      });
    } catch (error) {
      console.error("Get ticket notifications error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Create Notification Manually (Admin Only)
v1Router.post(
  "/notifications",
  authenticate,
  authorize("notifications.create"),
  async (req, res) => {
    try {
      const { user_id, title, message, type, related_ticket_id } = req.body;

      if (!user_id || !title || !message) {
        return res.status(400).json({
          status: false,
          error: "user_id, title, and message are required",
        });
      }

      const validTypes = ["info", "warning", "error", "success"];
      if (type && !validTypes.includes(type)) {
        return res.status(400).json({
          status: false,
          error: `Invalid type. Must be one of: ${validTypes.join(", ")}`,
        });
      }

      const { data, error } = await supabase
        .from("notifications")
        .insert({
          user_id,
          title,
          message,
          type: type || "info",
          related_ticket_id: related_ticket_id || null,
          is_read: false,
        })
        .select()
        .single();

      if (error) throw error;

      res.status(201).json({
        status: true,
        message: "Notification created successfully",
        data,
      });
    } catch (error) {
      console.error("Create notification error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// ===========================================
// SECTION 25: CHAT ROUTES (REST API FOR CHAT ROOMS)
// ===========================================

// Get All Rooms
v1Router.get("/chat/rooms", authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("chat_rooms")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) throw error;

    res.json({
      status: true,
      message: "Chat rooms retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Get rooms error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Get Room by ID
v1Router.get("/chat/rooms/:roomId", authenticate, async (req, res) => {
  try {
    const { roomId } = req.params;

    const { data, error } = await supabase
      .from("chat_rooms")
      .select("*")
      .eq("id", roomId)
      .single();

    if (error) throw error;

    res.json({
      status: true,
      message: "Chat room retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Get room error:", error);
    res.status(404).json({ status: false, error: error.message });
  }
});

// Create Room
v1Router.post("/chat/rooms", authenticate, async (req, res) => {
  try {
    const { name, type, created_by } = req.body;

    if (!name) {
      return res
        .status(400)
        .json({ status: false, error: "Room name is required" });
    }

    const { data: newRoom, error } = await supabase
      .from("chat_rooms")
      .insert({
        name,
        type: type || "group",
        created_by: created_by || req.user.id,
      })
      .select()
      .single();

    if (error) throw error;

    // Add creator as participant
    if (created_by || req.user.id) {
      await supabase
        .from("chat_room_participants")
        .insert({ room_id: newRoom.id, user_id: created_by || req.user.id });
    }

    res.status(201).json({
      status: true,
      message: "Chat room created successfully",
      data: newRoom,
    });
  } catch (error) {
    console.error("Create room error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Get Messages by Room
v1Router.get("/chat/rooms/:roomId/messages", authenticate, async (req, res) => {
  try {
    const { roomId } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    const { data, error } = await supabase
      .from("chat_messages")
      .select(
        `
        *,
        user:user_id (
          id, username, full_name, avatar_url
        )
      `
      )
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    res.json({
      status: true,
      message: "Messages retrieved successfully",
      data: data.reverse(),
    });
  } catch (error) {
    console.error("Get messages error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Send Message
v1Router.post(
  "/chat/rooms/:roomId/messages",
  authenticate,
  async (req, res) => {
    try {
      const { roomId } = req.params;
      const { message } = req.body;

      if (!message) {
        return res
          .status(400)
          .json({ status: false, error: "Message content is required" });
      }

      // Save message
      const { data: newMessage, error } = await supabase
        .from("chat_messages")
        .insert({
          room_id: roomId,
          user_id: req.user.id,
          message: message,
          is_read: false,
        })
        .select(
          `
        *,
        user:user_id (
          id, username, full_name, avatar_url
        )
      `
        )
        .single();

      if (error) throw error;

      // Update room
      await supabase
        .from("chat_rooms")
        .update({
          last_message: message,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", roomId);

      res.status(201).json({
        status: true,
        message: "Message sent successfully",
        data: newMessage,
      });
    } catch (error) {
      console.error("Send message error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Get User Rooms
v1Router.get("/chat/users/:userId/rooms", authenticate, async (req, res) => {
  try {
    const { userId } = req.params;

    // Authorization check
    if (
      req.user.id !== parseInt(userId) &&
      !["admin_kota", "admin_opd", "helpdesk"].includes(req.user.role)
    ) {
      return res.status(403).json({ status: false, error: "Access denied" });
    }

    const { data, error } = await supabase
      .from("chat_room_participants")
      .select(`room_id, chat_rooms (*)`)
      .eq("user_id", userId);

    if (error) throw error;

    const rooms = data.map((item) => item.chat_rooms);

    res.json({
      status: true,
      message: "User rooms retrieved successfully",
      data: rooms,
    });
  } catch (error) {
    console.error("Get user rooms error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Add Participant
v1Router.post(
  "/chat/rooms/:roomId/participants",
  authenticate,
  async (req, res) => {
    try {
      const { roomId } = req.params;
      const { userId } = req.body;

      if (!userId) {
        return res
          .status(400)
          .json({ status: false, error: "userId is required" });
      }

      const { data, error } = await supabase
        .from("chat_room_participants")
        .insert({ room_id: roomId, user_id: userId })
        .select()
        .single();

      if (error) throw error;

      res.status(201).json({
        status: true,
        message: "Participant added successfully",
        data,
      });
    } catch (error) {
      console.error("Add participant error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Get Unread Count
v1Router.get("/chat/users/:userId/unread", authenticate, async (req, res) => {
  try {
    const { userId } = req.params;

    // Authorization check
    if (
      req.user.id !== parseInt(userId) &&
      !["admin_kota", "admin_opd", "helpdesk"].includes(req.user.role)
    ) {
      return res.status(403).json({ status: false, error: "Access denied" });
    }

    const { count, error } = await supabase
      .from("chat_messages")
      .select("*", { count: "exact", head: true })
      .neq("user_id", userId)
      .eq("is_read", false);

    if (error) throw error;

    res.json({
      status: true,
      message: "Unread count retrieved successfully",
      data: { count },
    });
  } catch (error) {
    console.error("Get unread count error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Get Chat List for User
v1Router.get("/chat/users/:userId/list", authenticate, async (req, res) => {
  try {
    const { userId } = req.params;

    // Authorization check
    if (
      req.user.id !== parseInt(userId) &&
      !["admin_kota", "admin_opd", "helpdesk"].includes(req.user.role)
    ) {
      return res.status(403).json({ status: false, error: "Access denied" });
    }

    if (!userId) {
      return res
        .status(400)
        .json({ status: false, error: "userId is required" });
    }

    // Get room IDs
    const { data: roomParticipants, error: roomError } = await supabase
      .from("chat_room_participants")
      .select("room_id")
      .eq("user_id", userId);

    if (roomError) throw roomError;
    const roomIds = roomParticipants.map((r) => r.room_id);

    if (roomIds.length === 0) {
      return res.json({ status: true, message: "No chats found", data: [] });
    }

    // Get rooms
    const { data: rooms, error: roomsError } = await supabase
      .from("chat_rooms")
      .select("*")
      .in("id", roomIds)
      .order("updated_at", { ascending: false });

    if (roomsError) throw roomsError;

    // Process each room
    const chatList = await Promise.all(
      rooms.map(async (room) => {
        // Get other participant
        const { data: participants } = await supabase
          .from("chat_room_participants")
          .select("user_id")
          .eq("room_id", room.id)
          .neq("user_id", userId)
          .limit(1)
          .single();

        if (!participants) return null;

        const otherUserId = participants.user_id;

        // Get user details
        const { data: user } = await supabase
          .from("users")
          .select(
            `id, username, full_name, email, role, avatar_url, opd ( name )`
          )
          .eq("id", otherUserId)
          .single();

        if (!user) return null;

        // Get unread count
        const { count } = await supabase
          .from("chat_messages")
          .select("*", { count: "exact", head: true })
          .eq("room_id", room.id)
          .neq("user_id", userId)
          .eq("is_read", false);

        return {
          id: user.id,
          name: user.full_name || user.username,
          avatar:
            user.avatar_url ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(
              user.full_name || user.username
            )}&background=random`,
          lastMessage: room.last_message || "",
          lastMessageAt: room.last_message_at,
          unread: count || 0,
          role: user.role,
          opd: user.opd?.name || "Unknown OPD",
          email: user.email,
          roomId: room.id,
        };
      })
    );

    res.json({
      status: true,
      message: "Chat list retrieved successfully",
      data: chatList.filter(Boolean),
    });
  } catch (error) {
    console.error("Get chat list error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Mark Messages as Read
v1Router.put(
  "/chat/rooms/:roomId/messages/read",
  authenticate,
  async (req, res) => {
    try {
      const { roomId } = req.params;

      const { data, error } = await supabase
        .from("chat_messages")
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq("room_id", roomId)
        .neq("user_id", req.user.id)
        .eq("is_read", false)
        .select();

      if (error) throw error;

      res.json({
        status: true,
        message: `${data.length} messages marked as read`,
        data,
      });
    } catch (error) {
      console.error("Mark messages as read error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// ===========================================
// SECTION 26: TICKET COMMENTS (CHAT PER TIKET)
// ===========================================

// Get All Comments for a Ticket
v1Router.get("/tickets/:ticketId/comments", authenticate, async (req, res) => {
  try {
    const { ticketId } = req.params;

    const { data, error } = await supabase
      .from("ticket_comments")
      .select(
        `
        *,
        user:user_id (
          id, username, full_name, role, avatar_url
        )
      `
      )
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    res.json({
      status: true,
      message: "Comments retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Get ticket comments error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Get Public Comments Only (for reporters/users)
v1Router.get(
  "/tickets/:ticketId/comments/public",
  authenticate,
  async (req, res) => {
    try {
      const { ticketId } = req.params;

      const { data, error } = await supabase
        .from("ticket_comments")
        .select(
          `
        *,
        user:user_id (
          id, username, full_name, avatar_url
        )
      `
        )
        .eq("ticket_id", ticketId)
        .eq("is_internal", false)
        .order("created_at", { ascending: true });

      if (error) throw error;

      res.json({
        status: true,
        message: "Public comments retrieved successfully",
        data,
      });
    } catch (error) {
      console.error("Get public comments error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Get Internal Comments Only (for technicians/admins)
v1Router.get(
  "/tickets/:ticketId/comments/internal",
  authenticate,
  authorize("tickets.read"),
  async (req, res) => {
    try {
      const { ticketId } = req.params;

      const { data, error } = await supabase
        .from("ticket_comments")
        .select(
          `
        *,
        user:user_id (
          id, username, full_name, role, avatar_url
        )
      `
        )
        .eq("ticket_id", ticketId)
        .eq("is_internal", true)
        .order("created_at", { ascending: true });

      if (error) throw error;

      res.json({
        status: true,
        message: "Internal comments retrieved successfully",
        data,
      });
    } catch (error) {
      console.error("Get internal comments error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Create Ticket Comment
v1Router.post("/tickets/:ticketId/comments", authenticate, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { content, is_internal } = req.body;

    if (!content) {
      return res
        .status(400)
        .json({ status: false, error: "Content is required" });
    }

    const { data, error } = await supabase
      .from("ticket_comments")
      .insert({
        ticket_id: ticketId,
        user_id: req.user.id,
        content,
        is_internal: is_internal || false,
      })
      .select(
        `
        *,
        user:user_id (
          id, username, full_name, role, avatar_url
        )
      `
      )
      .single();

    if (error) throw error;

    // Log activity (using existing helper function)
    await logTicketActivity(
      ticketId,
      req.user.id,
      "comment",
      is_internal ? "Added internal note" : "Added comment"
    );

    res
      .status(201)
      .json({ status: true, message: "Comment created successfully", data });
  } catch (error) {
    console.error("Create ticket comment error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Update Ticket Comment
v1Router.put("/tickets/comments/:commentId", authenticate, async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body;

    if (!content) {
      return res
        .status(400)
        .json({ status: false, error: "Content is required" });
    }

    // Check ownership
    const { data: comment } = await supabase
      .from("ticket_comments")
      .select("user_id, ticket_id")
      .eq("id", commentId)
      .single();

    if (!comment) {
      return res
        .status(404)
        .json({ status: false, error: "Comment not found" });
    }

    // Authorization check
    if (
      req.user.id !== comment.user_id &&
      !["admin_kota", "admin_opd", "helpdesk"].includes(req.user.role)
    ) {
      return res.status(403).json({ status: false, error: "Access denied" });
    }

    const { data, error } = await supabase
      .from("ticket_comments")
      .update({
        content,
        updated_at: new Date().toISOString(),
      })
      .eq("id", commentId)
      .select(
        `
        *,
        user:user_id (
          id, username, full_name, role, avatar_url
        )
      `
      )
      .single();

    if (error) throw error;

    // Log activity
    await logTicketActivity(
      comment.ticket_id,
      req.user.id,
      "comment_update",
      "Updated comment"
    );

    res.json({ status: true, message: "Comment updated successfully", data });
  } catch (error) {
    console.error("Update ticket comment error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Delete Ticket Comment
v1Router.delete(
  "/tickets/comments/:commentId",
  authenticate,
  async (req, res) => {
    try {
      const { commentId } = req.params;

      // Check ownership
      const { data: comment } = await supabase
        .from("ticket_comments")
        .select("user_id, ticket_id")
        .eq("id", commentId)
        .single();

      if (!comment) {
        return res
          .status(404)
          .json({ status: false, error: "Comment not found" });
      }

      // Authorization check
      if (
        req.user.id !== comment.user_id &&
        !["admin_kota", "admin_opd", "helpdesk"].includes(req.user.role)
      ) {
        return res.status(403).json({ status: false, error: "Access denied" });
      }

      const { error } = await supabase
        .from("ticket_comments")
        .delete()
        .eq("id", commentId);

      if (error) throw error;

      // Log activity
      await logTicketActivity(
        comment.ticket_id,
        req.user.id,
        "comment_delete",
        "Deleted comment"
      );

      res.json({ status: true, message: "Comment deleted successfully" });
    } catch (error) {
      console.error("Delete ticket comment error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Get Comment Count for Ticket
v1Router.get(
  "/tickets/:ticketId/comments/count",
  authenticate,
  async (req, res) => {
    try {
      const { ticketId } = req.params;

      const { count, error } = await supabase
        .from("ticket_comments")
        .select("*", { count: "exact", head: true })
        .eq("ticket_id", ticketId);

      if (error) throw error;

      res.json({
        status: true,
        message: "Comment count retrieved successfully",
        data: { count },
      });
    } catch (error) {
      console.error("Get comment count error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);
// ===========================================
// 20. ERROR HANDLING
// ===========================================
// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    error:
      "BASE URL-NYA SALAH YA GAIS. YANG BENAR BASE URL: https://manpro-473802.et.r.appspot.com/api/v1",
    path: req.path,
    method: req.method,
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Global error:", err);

  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: "File terlalu besar. Maksimal 10MB" });
  }

  if (err.message === "Invalid file type") {
    return res.status(400).json({ error: "Tipe file tidak didukung" });
  }

  res.status(err.status || 500).json({
    error: err.message || "Terjadi kesalahan server",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});
// ===========================================
// SECTION 23: TICKET ARTICLES ROUTES
// ===========================================
// Get All Articles
v1Router.get("/articles", authenticate, async (req, res) => {
  try {
    const {
      status,
      kategori_artikel,
      visibility,
      id_ticket,
      author_name,
      tags,
    } = req.query;
    const limit = parseInt(req.query.limit) || 50;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;

    let query = supabase
      .from("o_ticket_articles")
      .select(
        `
        *,
        ticket:id_ticket (
          id, ticket_number, title, status
        )
      `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (status) query = query.eq("status", status);
    if (kategori_artikel)
      query = query.eq("kategori_artikel", kategori_artikel);
    if (visibility) query = query.eq("visibility", visibility);
    if (id_ticket) query = query.eq("id_ticket", id_ticket);
    if (author_name) query = query.ilike("author_name", `%${author_name}%`);
    if (tags) {
      // Filter by tags (contains any of the specified tags)
      query = query.contains("tags", [tags]);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      status: true,
      message: "Articles retrieved successfully",
      data,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get articles error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Get Article Categories
v1Router.get("/articles/categories", authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("o_ticket_articles")
      .select("kategori_artikel");

    if (error) throw error;

    const categories = [
      ...new Set(data.map((item) => item.kategori_artikel)),
    ].filter(Boolean);

    res.json({
      status: true,
      message: "Categories retrieved successfully",
      data: categories,
    });
  } catch (error) {
    console.error("Get categories error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Get Article Statistics
v1Router.get("/articles/stats", authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("o_ticket_articles")
      .select("id_artikel, kategori_artikel, status, visibility");

    if (error) throw error;

    const stats = {
      total: data.length,
      byCategory: {},
      byStatus: {},
      byVisibility: {},
    };

    data.forEach((article) => {
      if (article.kategori_artikel) {
        stats.byCategory[article.kategori_artikel] =
          (stats.byCategory[article.kategori_artikel] || 0) + 1;
      }
      if (article.status) {
        stats.byStatus[article.status] =
          (stats.byStatus[article.status] || 0) + 1;
      }
      if (article.visibility) {
        stats.byVisibility[article.visibility] =
          (stats.byVisibility[article.visibility] || 0) + 1;
      }
    });

    res.json({
      status: true,
      message: "Statistics retrieved successfully",
      data: stats,
    });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Get All Tags
v1Router.get("/articles/tags", authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("o_ticket_articles")
      .select("tags");

    if (error) throw error;

    // Flatten all tags and get unique values
    const allTags = data
      .filter((item) => item.tags && Array.isArray(item.tags))
      .flatMap((item) => item.tags);
    const uniqueTags = [...new Set(allTags)].sort();

    res.json({
      status: true,
      message: "Tags retrieved successfully",
      data: uniqueTags,
    });
  } catch (error) {
    console.error("Get tags error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Get Articles by Category
v1Router.get("/articles/category/:kategori", authenticate, async (req, res) => {
  try {
    const { kategori } = req.params;

    const { data, error } = await supabase
      .from("o_ticket_articles")
      .select(
        `
        *,
        ticket:id_ticket (
          id, ticket_number, title
        )
      `
      )
      .eq("kategori_artikel", kategori)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({
      status: true,
      message: "Articles retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Get articles by category error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Get Articles by Status
v1Router.get("/articles/status/:status", authenticate, async (req, res) => {
  try {
    const { status } = req.params;

    const { data, error } = await supabase
      .from("o_ticket_articles")
      .select(
        `
        *,
        ticket:id_ticket (
          id, ticket_number, title
        )
      `
      )
      .eq("status", status)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({
      status: true,
      message: "Articles retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Get articles by status error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Search Articles
v1Router.get("/articles/search", authenticate, async (req, res) => {
  try {
    const { keyword } = req.query;

    if (!keyword) {
      return res
        .status(400)
        .json({ status: false, error: "Keyword is required" });
    }

    const { data, error } = await supabase
      .from("o_ticket_articles")
      .select(
        `
        *,
        ticket:id_ticket (
          id, ticket_number, title
        )
      `
      )
      .or(
        `judul_artikel.ilike.%${keyword}%,content.ilike.%${keyword}%,author_name.ilike.%${keyword}%,custom_id.ilike.%${keyword}%`
      )
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({ status: true, message: "Articles searched successfully", data });
  } catch (error) {
    console.error("Search articles error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Get Article by ID or Custom ID
v1Router.get("/articles/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Try to get by id_artikel (numeric) or custom_id (string)
    let query = supabase.from("o_ticket_articles").select(`
        *,
        ticket:id_ticket (
          id, ticket_number, title, description, status, priority, category
        )
      `);

    if (!isNaN(id)) {
      query = query.eq("id_artikel", id);
    } else {
      query = query.eq("custom_id", id);
    }

    const { data, error } = await query.single();

    if (error) throw error;
    if (!data) {
      return res
        .status(404)
        .json({ status: false, error: "Article not found" });
    }

    res.json({ status: true, message: "Article retrieved successfully", data });
  } catch (error) {
    console.error("Get article by ID error:", error);
    if (error.code === "PGRST116") {
      res.status(404).json({ status: false, error: "Article not found" });
    } else {
      res.status(500).json({ status: false, error: error.message });
    }
  }
});

// Get Articles by Ticket ID
v1Router.get("/tickets/:ticketId/articles", authenticate, async (req, res) => {
  try {
    const { ticketId } = req.params;

    const { data, error } = await supabase
      .from("o_ticket_articles")
      .select("*")
      .eq("id_ticket", ticketId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({
      status: true,
      message: "Articles retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Get articles by ticket error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Create Article
v1Router.post(
  "/articles",
  authenticate,
  authorize("kb.write"),
  async (req, res) => {
    try {
      const {
        custom_id,
        id_ticket,
        judul_artikel,
        author_name,
        kategori_artikel,
        status,
        visibility,
        content,
        tags,
      } = req.body;

      // Validation
      if (!judul_artikel) {
        return res
          .status(400)
          .json({ status: false, error: "judul_artikel is required" });
      }

      // Auto-generate custom_id if not provided
      let articleCustomId = custom_id;
      if (!articleCustomId) {
        const { data: lastArticle } = await supabase
          .from("o_ticket_articles")
          .select("custom_id")
          .order("id_artikel", { ascending: false })
          .limit(1)
          .single();

        if (lastArticle && lastArticle.custom_id) {
          const lastNum = parseInt(lastArticle.custom_id.split("-")[1]);
          articleCustomId = `ART-${String(lastNum + 1).padStart(3, "0")}`;
        } else {
          articleCustomId = "ART-001";
        }
      }

      const { data, error } = await supabase
        .from("o_ticket_articles")
        .insert({
          custom_id: articleCustomId,
          id_ticket: id_ticket || null,
          judul_artikel,
          author_name:
            author_name ||
            `${req.user.full_name || req.user.username} (${req.user.role})`,
          kategori_artikel: kategori_artikel || null,
          status: status || "Draft",
          visibility: visibility || "public",
          content: content || null,
          tags: tags || [],
        })
        .select()
        .single();

      if (error) throw error;

      res
        .status(201)
        .json({ status: true, message: "Article created successfully", data });
    } catch (error) {
      console.error("Create article error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Update Article
v1Router.put(
  "/articles/:id",
  authenticate,
  authorize("kb.write"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const allowedFields = [
        "custom_id",
        "id_ticket",
        "judul_artikel",
        "author_name",
        "kategori_artikel",
        "status",
        "visibility",
        "content",
        "tags",
      ];

      const updateData = { updated_at: new Date().toISOString() };
      allowedFields.forEach((field) => {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      });

      let query = supabase.from("o_ticket_articles").update(updateData);

      if (!isNaN(id)) {
        query = query.eq("id_artikel", id);
      } else {
        query = query.eq("custom_id", id);
      }

      const { data, error } = await query.select().single();

      if (error) throw error;

      res.json({ status: true, message: "Article updated successfully", data });
    } catch (error) {
      console.error("Update article error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Delete Article (Hard Delete)
v1Router.delete(
  "/articles/:id",
  authenticate,
  authorize("kb.write"),
  async (req, res) => {
    try {
      const { id } = req.params;

      let query = supabase.from("o_ticket_articles").delete();

      if (!isNaN(id)) {
        query = query.eq("id_artikel", id);
      } else {
        query = query.eq("custom_id", id);
      }

      const { error } = await query;

      if (error) throw error;

      res.json({ status: true, message: "Article deleted successfully" });
    } catch (error) {
      console.error("Delete article error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Update Article Status
v1Router.patch(
  "/articles/:id/status",
  authenticate,
  authorize("kb.write"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status) {
        return res
          .status(400)
          .json({ status: false, error: "Status is required" });
      }

      const validStatuses = [
        "Draft",
        "Menunggu Review",
        "Published",
        "Rejected",
        "Archived",
      ];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          status: false,
          error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        });
      }

      let query = supabase.from("o_ticket_articles").update({
        status,
        updated_at: new Date().toISOString(),
      });

      if (!isNaN(id)) {
        query = query.eq("id_artikel", id);
      } else {
        query = query.eq("custom_id", id);
      }

      const { data, error } = await query.select().single();

      if (error) throw error;

      res.json({
        status: true,
        message: "Article status updated successfully",
        data,
      });
    } catch (error) {
      console.error("Update article status error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);
// ===========================================
// SECTION 24: DATABASE NOTIFICATIONS ROUTES (NO WHATSAPP)
// ===========================================

// Get User Notifications
v1Router.get("/notifications/users/:userId", authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    // Authorization check
    if (
      req.user.id !== parseInt(userId) &&
      !["admin_kota", "admin_opd", "helpdesk"].includes(req.user.role)
    ) {
      return res.status(403).json({ status: false, error: "Access denied" });
    }

    const { data, error } = await supabase
      .from("notifications")
      .select(
        `
        *,
        ticket:related_ticket_id (
          id, ticket_number, title, status, priority
        )
      `
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    res.json({
      status: true,
      message: "Notifications retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Get Notifications by Type
v1Router.get(
  "/notifications/users/:userId/type/:type",
  authenticate,
  async (req, res) => {
    try {
      const { userId, type } = req.params;
      const limit = parseInt(req.query.limit) || 50;

      // Authorization check
      if (
        req.user.id !== parseInt(userId) &&
        !["admin_kota", "admin_opd", "helpdesk"].includes(req.user.role)
      ) {
        return res.status(403).json({ status: false, error: "Access denied" });
      }

      const validTypes = ["info", "warning", "error", "success"];
      if (!validTypes.includes(type)) {
        return res.status(400).json({
          status: false,
          error: `Invalid type. Must be one of: ${validTypes.join(", ")}`,
        });
      }

      const { data, error } = await supabase
        .from("notifications")
        .select(
          `
        *,
        ticket:related_ticket_id (
          id, ticket_number, title, status
        )
      `
        )
        .eq("user_id", userId)
        .eq("type", type)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      res.json({
        status: true,
        message: `Notifications of type '${type}' retrieved successfully`,
        data,
      });
    } catch (error) {
      console.error("Get notifications by type error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Get Unread Count
v1Router.get(
  "/notifications/users/:userId/unread",
  authenticate,
  async (req, res) => {
    try {
      const { userId } = req.params;

      // Authorization check
      if (
        req.user.id !== parseInt(userId) &&
        !["admin_kota", "admin_opd", "helpdesk"].includes(req.user.role)
      ) {
        return res.status(403).json({ status: false, error: "Access denied" });
      }

      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false);

      if (error) throw error;

      res.json({
        status: true,
        message: "Unread count retrieved successfully",
        data: { count },
      });
    } catch (error) {
      console.error("Get unread count error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Mark Notification as Read
v1Router.put(
  "/notifications/:notificationId/read",
  authenticate,
  async (req, res) => {
    try {
      const { notificationId } = req.params;

      // Get notification to check ownership
      const { data: notification } = await supabase
        .from("notifications")
        .select("user_id")
        .eq("id", notificationId)
        .single();

      if (!notification) {
        return res
          .status(404)
          .json({ status: false, error: "Notification not found" });
      }

      // Authorization check
      if (
        req.user.id !== notification.user_id &&
        !["admin_kota", "admin_opd", "helpdesk"].includes(req.user.role)
      ) {
        return res.status(403).json({ status: false, error: "Access denied" });
      }

      const { data, error } = await supabase
        .from("notifications")
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq("id", notificationId)
        .select()
        .single();

      if (error) throw error;

      res.json({ status: true, message: "Notification marked as read", data });
    } catch (error) {
      console.error("Mark as read error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Mark All as Read
v1Router.put(
  "/notifications/users/:userId/read-all",
  authenticate,
  async (req, res) => {
    try {
      const { userId } = req.params;

      // Authorization check
      if (
        req.user.id !== parseInt(userId) &&
        !["admin_kota", "admin_opd", "helpdesk"].includes(req.user.role)
      ) {
        return res.status(403).json({ status: false, error: "Access denied" });
      }

      const { data, error } = await supabase
        .from("notifications")
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("is_read", false)
        .select();

      if (error) throw error;

      res.json({
        status: true,
        message: `All notifications marked as read (${data.length} updated)`,
        data,
      });
    } catch (error) {
      console.error("Mark all as read error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Delete Notification
v1Router.delete(
  "/notifications/:notificationId",
  authenticate,
  async (req, res) => {
    try {
      const { notificationId } = req.params;

      // Get notification to check ownership
      const { data: notification } = await supabase
        .from("notifications")
        .select("user_id")
        .eq("id", notificationId)
        .single();

      if (!notification) {
        return res
          .status(404)
          .json({ status: false, error: "Notification not found" });
      }

      // Authorization check
      if (
        req.user.id !== notification.user_id &&
        !["admin_kota", "admin_opd", "helpdesk"].includes(req.user.role)
      ) {
        return res.status(403).json({ status: false, error: "Access denied" });
      }

      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", notificationId);

      if (error) throw error;

      res.json({ status: true, message: "Notification deleted successfully" });
    } catch (error) {
      console.error("Delete notification error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Get Notification by ID
v1Router.get(
  "/notifications/:notificationId",
  authenticate,
  async (req, res) => {
    try {
      const { notificationId } = req.params;

      const { data, error } = await supabase
        .from("notifications")
        .select(
          `
        *,
        user:user_id (
          id, username, full_name, email
        ),
        ticket:related_ticket_id (
          id, ticket_number, title, status, priority
        )
      `
        )
        .eq("id", notificationId)
        .single();

      if (error) throw error;

      // Authorization check
      if (
        req.user.id !== data.user_id &&
        !["admin_kota", "admin_opd", "helpdesk"].includes(req.user.role)
      ) {
        return res.status(403).json({ status: false, error: "Access denied" });
      }

      res.json({
        status: true,
        message: "Notification retrieved successfully",
        data,
      });
    } catch (error) {
      console.error("Get notification error:", error);
      if (error.code === "PGRST116") {
        res
          .status(404)
          .json({ status: false, error: "Notification not found" });
      } else {
        res.status(500).json({ status: false, error: error.message });
      }
    }
  }
);

// Get Notifications by Ticket
v1Router.get(
  "/tickets/:ticketId/notifications",
  authenticate,
  async (req, res) => {
    try {
      const { ticketId } = req.params;

      const { data, error } = await supabase
        .from("notifications")
        .select(
          `
        *,
        user:user_id (
          id, username, full_name
        )
      `
        )
        .eq("related_ticket_id", ticketId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      res.json({
        status: true,
        message: "Ticket notifications retrieved successfully",
        data,
      });
    } catch (error) {
      console.error("Get ticket notifications error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Create Notification Manually (Admin Only)
v1Router.post(
  "/notifications",
  authenticate,
  authorize("notifications.create"),
  async (req, res) => {
    try {
      const { user_id, title, message, type, related_ticket_id } = req.body;

      if (!user_id || !title || !message) {
        return res.status(400).json({
          status: false,
          error: "user_id, title, and message are required",
        });
      }

      const validTypes = ["info", "warning", "error", "success"];
      if (type && !validTypes.includes(type)) {
        return res.status(400).json({
          status: false,
          error: `Invalid type. Must be one of: ${validTypes.join(", ")}`,
        });
      }

      const { data, error } = await supabase
        .from("notifications")
        .insert({
          user_id,
          title,
          message,
          type: type || "info",
          related_ticket_id: related_ticket_id || null,
          is_read: false,
        })
        .select()
        .single();

      if (error) throw error;

      res.status(201).json({
        status: true,
        message: "Notification created successfully",
        data,
      });
    } catch (error) {
      console.error("Create notification error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// ===========================================
// SECTION 25: CHAT ROUTES (DIRECT MESSAGING)
// ===========================================
// Send Message (POST /api/v1/chat)
v1Router.post("/chat", authenticate, async (req, res) => {
  try {
    const { sender_id, recipient_id, message } = req.body;

    // Validation
    if (!sender_id || !recipient_id || !message) {
      return res.status(400).json({
        status: false,
        error: "sender_id, recipient_id, and message are required",
      });
    }

    // Authorization check - user can only send as themselves
    if (req.user.id !== parseInt(sender_id)) {
      return res.status(403).json({
        status: false,
        error: "You can only send messages as yourself",
      });
    }

    // Insert chat message
    const { data, error } = await supabase
      .from("o_chat")
      .insert({
        sender_id,
        recipient_id,
        message,
      })
      .select(
        `
        *,
        sender:sender_id (
          id, username, full_name, avatar_url, role
        ),
        recipient:recipient_id (
          id, username, full_name, avatar_url, role
        )
      `
      )
      .single();

    if (error) throw error;

    res.status(201).json({
      status: true,
      message: "Chat message sent successfully",
      data,
    });
  } catch (error) {
    console.error("Send chat error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Get Chat History (GET /api/v1/chat/history/:userId)
v1Router.get("/chat/history/:userId", authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    // Get all messages between current user and target user
    const { data, error } = await supabase
      .from("o_chat")
      .select(
        `
        *,
        sender:sender_id (
          id, username, full_name, avatar_url, role
        ),
        recipient:recipient_id (
          id, username, full_name, avatar_url, role
        )
      `
      )
      .or(
        `and(sender_id.eq.${currentUserId},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${currentUserId})`
      )
      .order("created_at", { ascending: true });

    if (error) throw error;

    res.json({
      status: true,
      message: "Chat history retrieved successfully",
      data,
      count: data.length,
    });
  } catch (error) {
    console.error("Get chat history error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Get Chat Inbox (GET /api/v1/chat/inbox)
v1Router.get("/chat/inbox", authenticate, async (req, res) => {
  try {
    const currentUserId = req.user.id;

    // Get all messages where current user is sender or recipient
    const { data: allMessages, error } = await supabase
      .from("o_chat")
      .select("*")
      .or(`sender_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Group messages by conversation partner
    const conversationsMap = new Map();

    for (const msg of allMessages) {
      // Determine the other user in the conversation
      const otherUserId =
        msg.sender_id === currentUserId ? msg.recipient_id : msg.sender_id;

      // Only keep the latest message for each conversation
      if (!conversationsMap.has(otherUserId)) {
        conversationsMap.set(otherUserId, msg);
      }
    }

    // Get user details for each conversation partner
    const conversations = await Promise.all(
      Array.from(conversationsMap.entries()).map(
        async ([userId, lastMessage]) => {
          const { data: user, error: userError } = await supabase
            .from("users")
            .select(
              `
            id, 
            username, 
            full_name, 
            email, 
            role, 
            avatar_url,
            opd:opd_id (
              name
            )
          `
            )
            .eq("id", userId)
            .single();

          if (userError || !user) {
            console.error("Error fetching user:", userError);
            return null;
          }

          return {
            user_id: user.id,
            username: user.username,
            full_name: user.full_name,
            email: user.email,
            role: user.role,
            avatar:
              user.avatar_url ||
              `https://ui-avatars.com/api/?name=${encodeURIComponent(
                user.full_name || user.username
              )}&background=random`,
            opd_name: user.opd?.name || "N/A",
            last_message: lastMessage.message,
            last_message_time: lastMessage.created_at,
            is_sender: lastMessage.sender_id === currentUserId,
          };
        }
      )
    );

    // Filter out null values and sort by last message time
    const validConversations = conversations
      .filter((conv) => conv !== null)
      .sort(
        (a, b) => new Date(b.last_message_time) - new Date(a.last_message_time)
      );

    res.json({
      status: true,
      message: "Chat inbox retrieved successfully",
      data: validConversations,
      count: validConversations.length,
    });
  } catch (error) {
    console.error("Get chat inbox error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// ===========================================
// SECTION 26: TICKET COMMENTS (CHAT PER TIKET)
// ===========================================

// Get All Comments for a Ticket
v1Router.get("/tickets/:ticketId/comments", authenticate, async (req, res) => {
  try {
    const { ticketId } = req.params;

    const { data, error } = await supabase
      .from("ticket_comments")
      .select(
        `
        *,
        user:user_id (
          id, username, full_name, role, avatar_url
        )
      `
      )
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    res.json({
      status: true,
      message: "Comments retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Get ticket comments error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Get Public Comments Only (for reporters/users)
v1Router.get(
  "/tickets/:ticketId/comments/public",
  authenticate,
  async (req, res) => {
    try {
      const { ticketId } = req.params;

      const { data, error } = await supabase
        .from("ticket_comments")
        .select(
          `
        *,
        user:user_id (
          id, username, full_name, avatar_url
        )
      `
        )
        .eq("ticket_id", ticketId)
        .eq("is_internal", false)
        .order("created_at", { ascending: true });

      if (error) throw error;

      res.json({
        status: true,
        message: "Public comments retrieved successfully",
        data,
      });
    } catch (error) {
      console.error("Get public comments error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Get Internal Comments Only (for technicians/admins)
v1Router.get(
  "/tickets/:ticketId/comments/internal",
  authenticate,
  authorize("tickets.read"),
  async (req, res) => {
    try {
      const { ticketId } = req.params;

      const { data, error } = await supabase
        .from("ticket_comments")
        .select(
          `
        *,
        user:user_id (
          id, username, full_name, role, avatar_url
        )
      `
        )
        .eq("ticket_id", ticketId)
        .eq("is_internal", true)
        .order("created_at", { ascending: true });

      if (error) throw error;

      res.json({
        status: true,
        message: "Internal comments retrieved successfully",
        data,
      });
    } catch (error) {
      console.error("Get internal comments error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Create Ticket Comment
v1Router.post("/tickets/:ticketId/comments", authenticate, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { content, is_internal } = req.body;

    if (!content) {
      return res
        .status(400)
        .json({ status: false, error: "Content is required" });
    }

    const { data, error } = await supabase
      .from("ticket_comments")
      .insert({
        ticket_id: ticketId,
        user_id: req.user.id,
        content,
        is_internal: is_internal || false,
      })
      .select(
        `
        *,
        user:user_id (
          id, username, full_name, role, avatar_url
        )
      `
      )
      .single();

    if (error) throw error;

    // Log activity (using existing helper function)
    await logTicketActivity(
      ticketId,
      req.user.id,
      "comment",
      is_internal ? "Added internal note" : "Added comment"
    );

    res
      .status(201)
      .json({ status: true, message: "Comment created successfully", data });
  } catch (error) {
    console.error("Create ticket comment error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Update Ticket Comment
v1Router.put("/tickets/comments/:commentId", authenticate, async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body;

    if (!content) {
      return res
        .status(400)
        .json({ status: false, error: "Content is required" });
    }

    // Check ownership
    const { data: comment } = await supabase
      .from("ticket_comments")
      .select("user_id, ticket_id")
      .eq("id", commentId)
      .single();

    if (!comment) {
      return res
        .status(404)
        .json({ status: false, error: "Comment not found" });
    }

    // Authorization check
    if (
      req.user.id !== comment.user_id &&
      !["admin_kota", "admin_opd", "helpdesk"].includes(req.user.role)
    ) {
      return res.status(403).json({ status: false, error: "Access denied" });
    }

    const { data, error } = await supabase
      .from("ticket_comments")
      .update({
        content,
        updated_at: new Date().toISOString(),
      })
      .eq("id", commentId)
      .select(
        `
        *,
        user:user_id (
          id, username, full_name, role, avatar_url
        )
      `
      )
      .single();

    if (error) throw error;

    // Log activity
    await logTicketActivity(
      comment.ticket_id,
      req.user.id,
      "comment_update",
      "Updated comment"
    );

    res.json({ status: true, message: "Comment updated successfully", data });
  } catch (error) {
    console.error("Update ticket comment error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Delete Ticket Comment
v1Router.delete(
  "/tickets/comments/:commentId",
  authenticate,
  async (req, res) => {
    try {
      const { commentId } = req.params;

      // Check ownership
      const { data: comment } = await supabase
        .from("ticket_comments")
        .select("user_id, ticket_id")
        .eq("id", commentId)
        .single();

      if (!comment) {
        return res
          .status(404)
          .json({ status: false, error: "Comment not found" });
      }

      // Authorization check
      if (
        req.user.id !== comment.user_id &&
        !["admin_kota", "admin_opd", "helpdesk"].includes(req.user.role)
      ) {
        return res.status(403).json({ status: false, error: "Access denied" });
      }

      const { error } = await supabase
        .from("ticket_comments")
        .delete()
        .eq("id", commentId);

      if (error) throw error;

      // Log activity
      await logTicketActivity(
        comment.ticket_id,
        req.user.id,
        "comment_delete",
        "Deleted comment"
      );

      res.json({ status: true, message: "Comment deleted successfully" });
    } catch (error) {
      console.error("Delete ticket comment error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Get Comment Count for Ticket
v1Router.get(
  "/tickets/:ticketId/comments/count",
  authenticate,
  async (req, res) => {
    try {
      const { ticketId } = req.params;

      const { count, error } = await supabase
        .from("ticket_comments")
        .select("*", { count: "exact", head: true })
        .eq("ticket_id", ticketId);

      if (error) throw error;

      res.json({
        status: true,
        message: "Comment count retrieved successfully",
        data: { count },
      });
    } catch (error) {
      console.error("Get comment count error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);
// ===========================================
// SECTION 27: KNOWLEDGE BASE ROUTES (FAQ SYSTEM)
// ===========================================

// Get Public FAQ (Filtered by OPD)
v1Router.get("/public/faq", async (req, res) => {
  try {
    const { opd_id, keyword } = req.query;

    console.log("Fetching Public FAQ - Params:", { opd_id, keyword });

    let query = supabase
      .from("o_knowledge_base")
      .select(`
        id,
        question,
        answer,
        status,
        opd:opd_id (
          id,
          name
        )
      `)
      .eq("status", "published")
      .order("created_at", { ascending: false });

    // Filter by OPD ID if provided
    if (opd_id) {
      query = query.eq("opd_id", opd_id);
    }
    
    // Search keyword
    if (keyword) {
      query = query.or(`question.ilike.%${keyword}%,answer.ilike.%${keyword}%`);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      status: true,
      message: "FAQs retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Get Public FAQ error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Get FAQ for Employee's OPD (Authenticated)
v1Router.get("/faq/opd", authenticate, async (req, res) => {
  try {
    // 1. Get user's OPD ID
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("opd_id")
      .eq("id", req.user.id)
      .single();

    if (userError) throw userError;
    if (!user.opd_id) {
      return res.status(400).json({ status: false, error: "User does not have an OPD assigned" });
    }

    // 2. Fetch FAQs for that OPD
    const { data, error } = await supabase
      .from("o_knowledge_base")
      .select(`
        id,
        question,
        answer,
        status,
        opd:opd_id (
          id,
          name
        )
      `)
      .eq("opd_id", user.opd_id)
      .eq("status", "published")
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({
      status: true,
      message: "OPD FAQs retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Get OPD FAQ error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Create FAQ (Authenticated based on OPD ID)
v1Router.post("/faq", authenticate, async (req, res) => {
  try {
    const { question, answer, opd_id, status } = req.body;

    // Validation
    if (!question || !answer || !opd_id) {
      return res.status(400).json({ 
        status: false, 
        error: "Question, answer, and opd_id are required" 
      });
    }

    // Insert new FAQ
    const { data, error } = await supabase
      .from("o_knowledge_base")
      .insert({
        question,
        answer,
        opd_id,
        status: status || "published", // Default to published if not provided
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      status: true,
      message: "FAQ created successfully",
      data,
    });
  } catch (error) {
    console.error("Create FAQ error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// ===========================================
// SECTION 28: SURVEYS ROUTES (TICKET SATISFACTION RATING)
// ===========================================

// TABLE STRUCTURE: o_ticket_surveys
// - id (integer, PK, auto-increment)
// - ticket_id (integer, FK, UNIQUE) - one survey per ticket
// - score (integer, 1-5 rating, required)
// - review (text, nullable)
// - is_active (boolean, default true)
// - created_by (integer, nullable)
// - created_at (timestamp, default now())
// - updated_at (timestamp, default now())

// CONSTRAINT: ticket_id is UNIQUE (one survey per ticket only)
// CONSTRAINT: score must be between 1 and 5

// Get All Surveys
v1Router.get("/surveys", authenticate, async (req, res) => {
  try {
    const { is_active, min_score, max_score } = req.query;
    const limit = parseInt(req.query.limit) || 50;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;

    let query = supabase
      .from("o_ticket_surveys")
      .select(
        `
        *,
        ticket:ticket_id (
          id, ticket_number, title, status, priority
        ),
        creator:created_by (
          id, username, full_name
        )
      `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (is_active === "true") {
      query = query.eq("is_active", true);
    } else if (is_active === "false") {
      query = query.eq("is_active", false);
    }

    if (min_score) {
      query = query.gte("score", parseInt(min_score));
    }

    if (max_score) {
      query = query.lte("score", parseInt(max_score));
    }

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      status: true,
      message: "Surveys retrieved successfully",
      data,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get surveys error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Get Survey Statistics
v1Router.get(
  "/surveys/stats",
  authenticate,
  authorize("reports.read"),
  async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("o_ticket_surveys")
        .select("id, score, is_active")
        .eq("is_active", true);

      if (error) throw error;

      const total = data.length;
      const scoreDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      let totalScore = 0;

      data.forEach((survey) => {
        if (survey.score >= 1 && survey.score <= 5) {
          scoreDistribution[survey.score]++;
          totalScore += survey.score;
        }
      });

      const averageScore = total > 0 ? (totalScore / total).toFixed(2) : 0;

      const stats = {
        total,
        averageScore: parseFloat(averageScore),
        scoreDistribution,
        percentageByScore: {
          1: total > 0 ? ((scoreDistribution[1] / total) * 100).toFixed(1) : 0,
          2: total > 0 ? ((scoreDistribution[2] / total) * 100).toFixed(1) : 0,
          3: total > 0 ? ((scoreDistribution[3] / total) * 100).toFixed(1) : 0,
          4: total > 0 ? ((scoreDistribution[4] / total) * 100).toFixed(1) : 0,
          5: total > 0 ? ((scoreDistribution[5] / total) * 100).toFixed(1) : 0,
        },
      };

      res.json({
        status: true,
        message: "Survey statistics retrieved successfully",
        data: stats,
      });
    } catch (error) {
      console.error("Get survey stats error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Get Survey by ID
v1Router.get("/surveys/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("o_ticket_surveys")
      .select(
        `
        *,
        ticket:ticket_id (
          id, ticket_number, title, status, priority
        ),
        creator:created_by (
          id, username, full_name, email
        )
      `
      )
      .eq("id", id)
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ status: false, error: "Survey not found" });
    }

    res.json({ status: true, message: "Survey retrieved successfully", data });
  } catch (error) {
    console.error("Get survey by ID error:", error);
    if (error.code === "PGRST116") {
      res.status(404).json({ status: false, error: "Survey not found" });
    } else {
      res.status(500).json({ status: false, error: error.message });
    }
  }
});

// Check if Ticket Has Survey
v1Router.get(
  "/surveys/ticket/:ticketId/check",
  authenticate,
  async (req, res) => {
    try {
      const { ticketId } = req.params;

      const { data, error } = await supabase
        .from("o_ticket_surveys")
        .select("id, score, review, created_at")
        .eq("ticket_id", ticketId)
        .eq("is_active", true)
        .single();

      if (error && error.code !== "PGRST116") throw error;

      res.json({
        status: true,
        message: data ? "Survey exists for this ticket" : "No survey found",
        data: data || null,
        hasSurvey: !!data,
      });
    } catch (error) {
      console.error("Check ticket survey error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Get Survey by Ticket ID
v1Router.get("/tickets/:ticketId/survey", authenticate, async (req, res) => {
  try {
    const { ticketId } = req.params;

    const { data, error } = await supabase
      .from("o_ticket_surveys")
      .select(
        `
        *,
        ticket:ticket_id (
          id, ticket_number, title, status
        ),
        creator:created_by (
          id, username, full_name
        )
      `
      )
      .eq("ticket_id", ticketId)
      .eq("is_active", true)
      .single();

    if (error && error.code !== "PGRST116") throw error;

    if (!data) {
      return res
        .status(404)
        .json({ status: false, error: "No survey found for this ticket" });
    }

    res.json({ status: true, message: "Survey retrieved successfully", data });
  } catch (error) {
    console.error("Get ticket survey error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Create Survey
v1Router.post("/surveys", authenticate, async (req, res) => {
  try {
    const { ticket_id, score, review } = req.body;

    // Validation
    if (!ticket_id || !score) {
      return res
        .status(400)
        .json({ status: false, error: "ticket_id and score are required" });
    }

    // Validate score range
    if (score < 1 || score > 5) {
      return res
        .status(400)
        .json({ status: false, error: "Score must be between 1 and 5" });
    }

    // Check if survey already exists for this ticket
    const { data: existingSurvey } = await supabase
      .from("o_ticket_surveys")
      .select("id")
      .eq("ticket_id", ticket_id)
      .single();

    if (existingSurvey) {
      return res.status(409).json({
        status: false,
        error: "Survey already exists for this ticket. Use PUT to update.",
      });
    }

    const { data, error } = await supabase
      .from("o_ticket_surveys")
      .insert({
        ticket_id,
        score,
        review: review || null,
        created_by: req.user.id,
        is_active: true,
      })
      .select(
        `
        *,
        ticket:ticket_id (
          id, ticket_number, title
        )
      `
      )
      .single();

    if (error) throw error;

    res
      .status(201)
      .json({ status: true, message: "Survey created successfully", data });
  } catch (error) {
    console.error("Create survey error:", error);
    if (error.code === "23505") {
      // Unique constraint violation
      res.status(409).json({
        status: false,
        error: "Survey already exists for this ticket",
      });
    } else {
      res.status(500).json({ status: false, error: error.message });
    }
  }
});

// Update Survey
v1Router.put("/surveys/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { score, review, is_active } = req.body;

    // Get survey to check ownership or admin rights
    const { data: survey } = await supabase
      .from("o_ticket_surveys")
      .select("created_by, ticket_id")
      .eq("id", id)
      .single();

    if (!survey) {
      return res.status(404).json({ status: false, error: "Survey not found" });
    }

    // Authorization: Only creator or admin can update
    if (
      survey.created_by !== req.user.id &&
      !["admin_kota", "admin_opd", "helpdesk"].includes(req.user.role)
    ) {
      return res.status(403).json({ status: false, error: "Access denied" });
    }

    const updateData = { updated_at: new Date().toISOString() };

    if (score !== undefined) {
      if (score < 1 || score > 5) {
        return res
          .status(400)
          .json({ status: false, error: "Score must be between 1 and 5" });
      }
      updateData.score = score;
    }

    if (review !== undefined) updateData.review = review;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data, error } = await supabase
      .from("o_ticket_surveys")
      .update(updateData)
      .eq("id", id)
      .select(
        `
        *,
        ticket:ticket_id (
          id, ticket_number, title
        )
      `
      )
      .single();

    if (error) throw error;

    res.json({ status: true, message: "Survey updated successfully", data });
  } catch (error) {
    console.error("Update survey error:", error);
    res.status(500).json({ status: false, error: error.message });
  }
});

// Soft Delete Survey (Deactivate)
v1Router.patch(
  "/surveys/:id/deactivate",
  authenticate,
  authorize("reports.read"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const { data, error } = await supabase
        .from("o_ticket_surveys")
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      res.json({
        status: true,
        message: "Survey deactivated successfully",
        data,
      });
    } catch (error) {
      console.error("Deactivate survey error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Delete Survey (Hard Delete - Admin Only)
v1Router.delete(
  "/surveys/:id",
  authenticate,
  authorize("reports.read"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const { error } = await supabase
        .from("o_ticket_surveys")
        .delete()
        .eq("id", id);

      if (error) throw error;

      res.json({ status: true, message: "Survey deleted successfully" });
    } catch (error) {
      console.error("Delete survey error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);

// Get Surveys by Score Range
v1Router.get(
  "/surveys/score/:score",
  authenticate,
  authorize("reports.read"),
  async (req, res) => {
    try {
      const { score } = req.params;
      const scoreNum = parseInt(score);

      if (scoreNum < 1 || scoreNum > 5) {
        return res
          .status(400)
          .json({ status: false, error: "Score must be between 1 and 5" });
      }

      const { data, error } = await supabase
        .from("o_ticket_surveys")
        .select(
          `
        *,
        ticket:ticket_id (
          id, ticket_number, title, status
        ),
        creator:created_by (
          id, username, full_name
        )
      `
        )
        .eq("score", scoreNum)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) throw error;

      res.json({
        status: true,
        message: `Surveys with score ${scoreNum} retrieved successfully`,
        data,
      });
    } catch (error) {
      console.error("Get surveys by score error:", error);
      res.status(500).json({ status: false, error: error.message });
    }
  }
);
// ===========================================
// 21. SERVER START
// ===========================================
app.listen(PORT, () => {
  console.log(`
================================================================
🚀 SERVICE DESK API V2.0
================================================================
Port: ${PORT}
Environment: ${process.env.NODE_ENV || "development"}
Status: ✅ Running
Roles:
- super_admin       : Full access
- admin_kota        : City-level admin
- admin_opd         : Department admin
- bidang            : Section head (verifier)
- seksi             : Unit head (recorder)
- teknisi           : Technician (handler)
- pegawai_opd       : OPD Employee
- pengguna          : End user

API Documentation: http://localhost:${PORT}/api-docs
================================================================
  `);
});

// ===========================================
// 22. GRACEFUL SHUTDOWN
// ===========================================
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully...");
  process.exit(0);
});

module.exports = app;
