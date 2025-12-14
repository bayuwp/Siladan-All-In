const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Siladan App API",
      version: "2.0.0",
      description:
        "API untuk mengelola insiden, permintaan layanan, pengguna, dan lainnya dalam sistem service desk.",
      contact: {
        name: "Contact Developer Ganteng",
        url: "http://wa.me/+6281357571468",
      },
    },
    servers: [
      {
        url: "http://localhost:8080",
        description: "Development server",
      },
      {
        url: "https://manpro-473802.et.r.appspot.com",
        description: "Production server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        User: {
          type: "object",
          properties: {
            id: { type: "integer" },
            username: { type: "string" },
            full_name: { type: "string" },
            email: { type: "string" },
            nip: { type: "string" },
            phone: { type: "string" },
            address: { type: "string" },
            role: { type: "string" },
            opd_id: { type: "integer" },
            permissions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  action: { type: "string" },
                  subject: { type: "string" },
                },
              },
            },
          },
        },
        Ticket: {
          type: "object",
          properties: {
            id: { type: "integer" },
            ticket_number: { type: "string" },
            type: { type: "string", enum: ["incident", "request"] },
            title: { type: "string" },
            description: { type: "string" },
            status: {
              type: "string",
              enum: [
                "open",
                "assigned",
                "in_progress",
                "pending_approval",
                "resolved",
                "closed",
                "rejected",
              ],
            },
            stage: {
              type: "string",
              enum: ["triase", "verification", "execution", "finished"],
            },
            priority: {
              type: "string",
              enum: ["low", "medium", "high", "major"],
            },
            urgency: { type: "integer" },
            impact: { type: "integer" },
            category: { type: "string" },
            incident_location: { type: "string" },
            opd_id: { type: "integer" },
            reporter_id: { type: "integer" },
            assigned_to: { type: "integer" },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
            sla_due: { type: "string", format: "date-time" },
            reporter: { $ref: "#/components/schemas/User" },
            technician: { $ref: "#/components/schemas/User" },
            opd: {
              type: "object",
              properties: {
                id: { type: "integer" },
                name: { type: "string" },
                code: { type: "string" },
              },
            },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: { type: "string" },
          },
        },
        Success: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            message: { type: "string" },
          },
        },
        PaginatedResponse: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/Ticket" },
            },
            pagination: {
              type: "object",
              properties: {
                page: { type: "integer" },
                limit: { type: "integer" },
                total: { type: "integer" },
                total_pages: { type: "integer" },
              },
            },
          },
        },
        LoginRequest: {
          type: "object",
          required: ["username", "password"],
          properties: {
            username: { type: "string" },
            password: { type: "string" },
          },
        },
        LoginResponse: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            token: { type: "string" },
            user: { $ref: "#/components/schemas/User" },
          },
        },
        RegisterRequest: {
          type: "object",
          required: ["username", "password", "email", "full_name"],
          properties: {
            username: { type: "string" },
            password: { type: "string" },
            email: { type: "string" },
            full_name: { type: "string" },
            nip: { type: "string" },
            phone: { type: "string" },
            address: { type: "string" },
          },
        },
        CreateIncidentRequest: {
          type: "object",
          required: ["title", "description"],
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            category: { type: "string" },
            incident_location: { type: "string" },
            incident_date: { type: "string", format: "date" },
            opd_id: { type: "integer" },
            asset_identifier: { type: "string" },
            attachment_url: { type: "string" },
          },
        },
        CreatePublicIncidentRequest: {
          type: "object",
          required: [
            "title",
            "description",
            "opd_id",
            "reporter_name",
            "reporter_email",
            "reporter_phone",
          ],
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            category: { type: "string" },
            incident_location: { type: "string" },
            incident_date: { type: "string", format: "date" },
            opd_id: { type: "integer" },
            asset_identifier: { type: "string" },
            reporter_name: { type: "string" },
            reporter_email: { type: "string" },
            reporter_phone: { type: "string" },
            reporter_address: { type: "string" },
            reporter_nik: { type: "string" },
            attachment_url: { type: "string" },
          },
        },
        CreateServiceRequestRequest: {
          type: "object",
          required: ["title", "description", "service_item_id"],
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            service_item_id: { type: "integer" },
            service_detail: { type: "object" },
            attachment_url: { type: "string" },
            requested_date: { type: "string", format: "date" },
          },
        },
        ApproveRequestRequest: {
          type: "object",
          properties: {
            notes: { type: "string" },
          },
        },
        RejectRequestRequest: {
          type: "object",
          required: ["notes"],
          properties: {
            notes: { type: "string" },
          },
        },
        CommentRequest: {
          type: "object",
          required: ["content"],
          properties: {
            content: { type: "string" },
            is_internal: { type: "boolean" },
          },
        },
        ProgressUpdateRequest: {
          type: "object",
          required: ["update_number", "status_change"],
          properties: {
            update_number: { type: "integer" },
            status_change: { type: "string" },
            stage_change: { type: "string" },
            reason: { type: "string" },
            problem_detail: { type: "string" },
            handling_description: { type: "string" },
            final_solution: { type: "string" },
          },
        },
        FAQ: {
          type: "object",
          properties: {
            id: { type: "integer" },
            question: { type: "string" },
            answer: { type: "string" },
            status: { 
              type: "string",
              enum: ["published", "draft"],
              default: "published"
            },
            opd_id: { type: "integer" },
            opd: {
              type: "object",
              properties: {
                id: { type: "integer" },
                name: { type: "string" },
              },
            },
            created_at: { type: "string", format: "date-time" },
          },
        },
        Survey: {
          type: "object",
          properties: {
            id_surveys: { type: "integer" },
            ticket_id: { type: "integer" },
            created_by: { type: "integer" },
            rating: { type: "integer" },
            feedback: { type: "string" },
            category: { type: "string" },
            created_at: { type: "string", format: "date-time" },
          },
        },
        ServiceCatalogItem: {
          type: "object",
          properties: {
            id: { type: "integer" },
            opd_id: { type: "integer" },
            catalog_id: { type: "integer" },
            parent_item_id: { type: "integer" },
            item_code: { type: "string" },
            item_name: { type: "string" },
            item_level: {
              type: "string",
              enum: ["sub_layanan", "layanan"],
              description: "Level 2 (sub_layanan) atau Level 3 (layanan)",
            },
            description: { type: "string" },
            approval_required: { type: "boolean" },
            approval_levels: {
              type: "array",
              items: { type: "string" },
              description:
                "Array of role names for approval workflow, e.g. ['seksi', 'kabid']",
            },
            required_fields: {
              type: "object",
              description: "JSON configuration for form input fields",
            },
            is_active: { type: "boolean" },
            display_order: { type: "integer" },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
          },
        },
        SLAConfig: {
          type: "object",
          properties: {
            id: { type: "integer" },
            opd_id: { type: "integer" },
            priority: {
              type: "string",
              enum: ["low", "medium", "high", "major"],
            },
            resolution_time: {
              type: "integer",
              description: "Resolution time in hours",
            },
            description: {
              type: "string",
              description: "SLA response description text",
            },
            ticket_type: {
              type: "string",
              enum: ["incident", "request"],
              default: "incident",
            },
          },
        },
        AssignTechnicianRequest: {
          type: "object",
          required: ["technician_id"],
          properties: {
            technician_id: {
              type: "integer",
              description: "ID of the technician to assign",
            },
          },
        },
        Dashboard: {
          type: "object",
          properties: {
            total_tickets: { type: "integer" },
            by_status: {
              type: "object",
              properties: {
                open: { type: "integer" },
                assigned: { type: "integer" },
                in_progress: { type: "integer" },
                resolved: { type: "integer" },
                closed: { type: "integer" },
              },
            },
            by_priority: {
              type: "object",
              properties: {
                low: { type: "integer" },
                medium: { type: "integer" },
                high: { type: "integer" },
                major: { type: "integer" },
              },
            },
            role: { type: "string" },
            scope: { type: "string" },
            my_assigned_tickets: {
              type: "array",
              description: "Daftar 5 tiket terbaru yang ditugaskan ke pengguna",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "Ticket number" },
                  title: { type: "string" },
                  type: {
                    type: "string",
                    enum: ["Pengaduan", "Permintaan Layanan"],
                  },
                  status: { type: "string" },
                  stage: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    paths: {
      "/api/v1": {
        get: {
          tags: ["General"],
          summary: "Get API Information",
          description: "Mendapatkan informasi dasar tentang API",
          responses: {
            200: {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      version: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/auth/login": {
        post: {
          tags: ["Authentication"],
          summary: "User Login",
          description: "Autentikasi pengguna dengan username dan password",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LoginRequest" },
              },
            },
          },
          responses: {
            200: {
              description: "Login successful",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/LoginResponse" },
                },
              },
            },
            400: {
              description: "Bad Request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            401: {
              description: "Unauthorized",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/auth/register": {
        post: {
          tags: ["Authentication"],
          summary: "User Registration",
          description: "Mendaftarkan pengguna baru",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RegisterRequest" },
              },
            },
          },
          responses: {
            201: {
              description: "Registration successful",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      user: { $ref: "#/components/schemas/User" },
                    },
                  },
                },
              },
            },
            400: {
              description: "Bad Request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/auth/logout": {
        post: {
          tags: ["Authentication"],
          summary: "User Logout",
          description: "Logout pengguna (hanya menghapus token di sisi klien)",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Logout successful",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Success" },
                },
              },
            },
          },
        },
      },
      "/api/v1/auth/me": {
        get: {
          tags: ["Authentication"],
          summary: "Get Current User Profile",
          description: "Mendapatkan profil pengguna yang sedang login",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      user: { $ref: "#/components/schemas/User" },
                    },
                  },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
        put: {
          tags: ["Authentication"],
          summary: "Update Current User Profile",
          description: "Memperbarui profil pengguna yang sedang login",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    username: { type: "string" },
                    avatar_url: { type: "string" },
                    phone: { type: "string" },
                    address: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Profile updated successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      user: { $ref: "#/components/schemas/User" },
                    },
                  },
                },
              },
            },
            400: {
              description: "Bad Request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/auth/change-password": {
        post: {
          tags: ["Authentication"],
          summary: "Change Password",
          description: "Mengubah password pengguna yang sedang login",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["old_password", "new_password", "confirm_new_password"],
                  properties: {
                    old_password: { type: "string" },
                    new_password: { type: "string" },
                    confirm_new_password: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Password changed successfully",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Success" },
                },
              },
            },
            400: {
              description: "Bad Request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            401: {
              description: "Unauthorized or Incorrect Old Password",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/auth/forgot-password": {
        post: {
          tags: ["Authentication"],
          summary: "Forgot Password",
          description: "Mengirim OTP reset password via WhatsApp",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["phone"],
                  properties: {
                    phone: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Reset password link sent",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Success" },
                },
              },
            },
            400: {
              description: "Bad Request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/incidents": {
        get: {
          tags: ["Incident Management"],
          summary: "Get Incidents",
          description: "Mendapatkan daftar insiden berdasarkan filter",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "status",
              in: "query",
              description: "Filter by status",
              schema: { type: "string" },
            },
            {
              name: "priority",
              in: "query",
              description: "Filter by priority",
              schema: { type: "string" },
            },
            {
              name: "search",
              in: "query",
              description: "Search by title, ticket number, or description",
              schema: { type: "string" },
            },
            {
              name: "opd_id",
              in: "query",
              description: "Filter by OPD ID",
              schema: { type: "integer" },
            },
            {
              name: "page",
              in: "query",
              description: "Page number",
              schema: { type: "integer", default: 1 },
            },
            {
              name: "limit",
              in: "query",
              description: "Items per page",
              schema: { type: "integer", default: 20 },
            },
          ],
          responses: {
            200: {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PaginatedResponse" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
        post: {
          tags: ["Incident Management"],
          summary: "Create Incident",
          description: "Membuat insiden baru",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateIncidentRequest" },
              },
            },
          },
          responses: {
            201: {
              description: "Incident created successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      ticket: { $ref: "#/components/schemas/Ticket" },
                    },
                  },
                },
              },
            },
            400: {
              description: "Bad Request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            401: {
              description: "Unauthorized",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            403: {
              description: "Forbidden",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/incidents/{id}": {
        get: {
          tags: ["Incident Management"],
          summary: "Get Incident Detail",
          description: "Mendapatkan detail insiden berdasarkan ID",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Incident ID",
              schema: { type: "integer" },
            },
          ],
          responses: {
            200: {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      ticket: { $ref: "#/components/schemas/Ticket" },
                      attachments: {
                        type: "array",
                        items: { type: "object" },
                      },
                      progress_updates: {
                        type: "array",
                        items: { type: "object" },
                      },
                      comments: {
                        type: "array",
                        items: { type: "object" },
                      },
                      logs: {
                        type: "array",
                        items: { type: "object" },
                      },
                    },
                  },
                },
              },
            },
            403: {
              description: "Forbidden",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            404: {
              description: "Incident not found",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
        put: {
          tags: ["Incident Management"],
          summary: "Update Incident",
          description: "Memperbarui insiden berdasarkan ID",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Incident ID",
              schema: { type: "integer" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    category: { type: "string" },
                    status: { type: "string" },
                    assigned_to: { type: "integer" },
                    stage: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Incident updated successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      ticket: { $ref: "#/components/schemas/Ticket" },
                    },
                  },
                },
              },
            },
            400: {
              description: "Bad Request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            401: {
              description: "Unauthorized",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            403: {
              description: "Forbidden",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/incidents/{id}/classify": {
        put: {
          tags: ["Incident Management"],
          summary: "Classify Incident",
          description: "Mengklasifikasi insiden berdasarkan urgency dan impact",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Incident ID",
              schema: { type: "integer" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["urgency", "impact"],
                  properties: {
                    urgency: { type: "integer" },
                    impact: { type: "integer" },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Incident classified successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      ticket: { $ref: "#/components/schemas/Ticket" },
                    },
                  },
                },
              },
            },
            400: {
              description: "Bad Request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            401: {
              description: "Unauthorized",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            403: {
              description: "Forbidden",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            404: {
              description: "Incident not found",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/incidents/{id}/assign": {
        put: {
          tags: ["Incident Management"],
          summary: "Assign or Reassign Technician to Incident",
          description:
            "Menugaskan atau mengganti teknisi untuk insiden. Membutuhkan permission 'tickets.assign' untuk assign pertama atau 'tickets.reassign' untuk mengganti teknisi.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Incident ID",
              schema: { type: "integer" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AssignTechnicianRequest",
                },
              },
            },
          },
          responses: {
            200: {
              description: "Technician assigned/reassigned successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      ticket: { $ref: "#/components/schemas/Ticket" },
                    },
                  },
                },
              },
            },
            400: {
              description: "Bad Request - technician_id is required",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            403: {
              description:
                "Forbidden - User does not have assign/reassign permission",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            404: {
              description: "Incident not found",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/incidents/merge": {
        post: {
          tags: ["Incident Management"],
          summary: "Merge Incidents",
          description: "Menggabungkan beberapa insiden menjadi satu",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["source_ticket_ids", "target_ticket_id", "reason"],
                  properties: {
                    source_ticket_ids: {
                      type: "array",
                      items: { type: "integer" },
                    },
                    target_ticket_id: { type: "integer" },
                    reason: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Incidents merged successfully",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Success" },
                },
              },
            },
            400: {
              description: "Bad Request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            401: {
              description: "Unauthorized",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            403: {
              description: "Forbidden",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/public/incidents": {
        post: {
          tags: ["Public"],
          summary: "Create Public Incident",
          description: "Membuat insiden baru untuk umum (tanpa login)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreatePublicIncidentRequest",
                },
              },
            },
          },
          responses: {
            201: {
              description: "Incident created successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      ticket: { $ref: "#/components/schemas/Ticket" },
                    },
                  },
                },
              },
            },
            400: {
              description: "Bad Request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/public/opd": {
        get: {
          tags: ["Public"],
          summary: "Get Public OPD",
          description: "Mendapatkan daftar OPD yang aktif untuk umum",
          responses: {
            200: {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "integer" },
                            name: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/public/tickets/{ticket_number}": {
        get: {
          tags: ["Public"],
          summary: "Get Public Ticket",
          description:
            "Mendapatkan detail tiket untuk umum berdasarkan nomor tiket",
          parameters: [
            {
              name: "ticket_number",
              in: "path",
              required: true,
              description: "Ticket Number",
              schema: { type: "string" },
            },
          ],
          responses: {
            200: {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "object",
                        properties: {
                          ticket_info: {
                            type: "object",
                            properties: {
                              ticket_number: { type: "string" },
                              title: { type: "string" },
                              description: { type: "string" },
                              status: { type: "string" },
                              category: { type: "string" },
                              opd_name: { type: "string" },
                              location: { type: "string" },
                              reporter_name: { type: "string" },
                              created_at: {
                                type: "string",
                                format: "date-time",
                              },
                              last_updated: {
                                type: "string",
                                format: "date-time",
                              },
                            },
                          },
                          timeline: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                update_time: {
                                  type: "string",
                                  format: "date-time",
                                },
                                status_change: { type: "string" },
                                handling_description: { type: "string" },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            404: {
              description: "Ticket not found",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/catalog": {
        get: {
          tags: ["Catalog"],
          summary: "Get Service Catalog",
          description: "Mendapatkan katalog layanan",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "opd_id",
              in: "query",
              description: "Filter by OPD ID",
              schema: { type: "integer" },
            },
            {
              name: "is_active",
              in: "query",
              description: "Filter by active status",
              schema: { type: "boolean" },
            },
          ],
          responses: {
            200: {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "integer" },
                            name: { type: "string" },
                            icon: { type: "string" },
                            isReadOnly: { type: "boolean" },
                            children: {
                              type: "array",
                              items: {
                                type: "object",
                                properties: {
                                  id: { type: "integer" },
                                  name: { type: "string" },
                                  needAsset: { type: "boolean" },
                                  workflow: { type: "string" },
                                  children: {
                                    type: "array",
                                    items: {
                                      type: "object",
                                      properties: {
                                        id: { type: "integer" },
                                        name: { type: "string" },
                                        desc: { type: "string" },
                                        needAsset: { type: "boolean" },
                                        workflow: { type: "string" },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/requests": {
        get: {
          tags: ["Service Request Management"],
          summary: "Get Service Requests",
          description:
            "Mendapatkan daftar permintaan layanan berdasarkan filter",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "status",
              in: "query",
              description: "Filter by status",
              schema: { type: "string" },
            },
            {
              name: "search",
              in: "query",
              description: "Search by title, ticket number, or description",
              schema: { type: "string" },
            },
            {
              name: "opd_id",
              in: "query",
              description: "Filter by OPD ID",
              schema: { type: "integer" },
            },
            {
              name: "page",
              in: "query",
              description: "Page number",
              schema: { type: "integer", default: 1 },
            },
            {
              name: "limit",
              in: "query",
              description: "Items per page",
              schema: { type: "integer", default: 20 },
            },
          ],
          responses: {
            200: {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PaginatedResponse" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
        post: {
          tags: ["Service Request Management"],
          summary: "Create Service Request",
          description: "Membuat permintaan layanan baru",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/CreateServiceRequestRequest",
                },
              },
            },
          },
          responses: {
            201: {
              description: "Service request created successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      ticket: { $ref: "#/components/schemas/Ticket" },
                    },
                  },
                },
              },
            },
            400: {
              description: "Bad Request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            401: {
              description: "Unauthorized",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            403: {
              description: "Forbidden",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/requests/{id}": {
        get: {
          tags: ["Service Request Management"],
          summary: "Get Service Request Detail",
          description: "Mendapatkan detail permintaan layanan berdasarkan ID",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Service Request ID",
              schema: { type: "integer" },
            },
          ],
          responses: {
            200: {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      ticket: { $ref: "#/components/schemas/Ticket" },
                      approvals: {
                        type: "array",
                        items: { type: "object" },
                      },
                      progress_updates: {
                        type: "array",
                        items: { type: "object" },
                      },
                    },
                  },
                },
              },
            },
            403: {
              description: "Forbidden",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            404: {
              description: "Service request not found",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
        put: {
          tags: ["Service Request Management"],
          summary: "Update Service Request",
          description: "Memperbarui permintaan layanan berdasarkan ID",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Service Request ID",
              schema: { type: "integer" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    category: { type: "string" },
                    status: { type: "string" },
                    assigned_to: { type: "integer" },
                    stage: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Service request updated successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      ticket: { $ref: "#/components/schemas/Ticket" },
                    },
                  },
                },
              },
            },
            400: {
              description: "Bad Request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            401: {
              description: "Unauthorized",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            403: {
              description: "Forbidden",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/requests/{id}/classify": {
        put: {
          tags: ["Service Request Management"],
          summary: "Classify Service Request",
          description:
            "Mengklasifikasi permintaan layanan berdasarkan urgency dan impact",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Service Request ID",
              schema: { type: "integer" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["urgency", "impact"],
                  properties: {
                    urgency: { type: "integer" },
                    impact: { type: "integer" },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Service request classified successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      ticket: { $ref: "#/components/schemas/Ticket" },
                    },
                  },
                },
              },
            },
            400: {
              description: "Bad Request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            401: {
              description: "Unauthorized",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            403: {
              description: "Forbidden",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            404: {
              description: "Service request not found",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/requests/{id}/approve": {
        post: {
          tags: ["Service Request Management"],
          summary: "Approve Service Request",
          description: "Menyetujui permintaan layanan",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Service Request ID",
              schema: { type: "integer" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApproveRequestRequest" },
              },
            },
          },
          responses: {
            200: {
              description: "Service request approved successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      all_approved: { type: "boolean" },
                    },
                  },
                },
              },
            },
            404: {
              description: "Approval not found",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/requests/{id}/reject": {
        post: {
          tags: ["Service Request Management"],
          summary: "Reject Service Request",
          description: "Menolak permintaan layanan",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Service Request ID",
              schema: { type: "integer" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RejectRequestRequest" },
              },
            },
          },
          responses: {
            200: {
              description: "Service request rejected successfully",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Success" },
                },
              },
            },
            400: {
              description: "Bad Request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            404: {
              description: "Approval not found",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/dashboard": {
        get: {
          tags: ["General"],
          summary: "Get Dashboard Data",
          description: "Mendapatkan data dashboard berdasarkan role pengguna",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      dashboard: { $ref: "#/components/schemas/Dashboard" },
                    },
                  },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/search": {
        get: {
          tags: ["General"],
          summary: "Search",
          description: "Mencari tiket dan artikel knowledge base",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "q",
              in: "query",
              required: true,
              description: "Search query",
              schema: { type: "string" },
            },
            {
              name: "type",
              in: "query",
              description: "Search type (tickets, kb)",
              schema: { type: "string" },
            },
            {
              name: "page",
              in: "query",
              description: "Page number",
              schema: { type: "integer", default: 1 },
            },
            {
              name: "limit",
              in: "query",
              description: "Items per page",
              schema: { type: "integer", default: 20 },
            },
          ],
          responses: {
            200: {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      query: { type: "string" },
                      results: {
                        type: "object",
                        properties: {
                          tickets: {
                            type: "object",
                            properties: {
                              data: {
                                type: "array",
                                items: { $ref: "#/components/schemas/Ticket" },
                              },
                              count: { type: "integer" },
                            },
                          },
                          kb: {
                            type: "object",
                            properties: {
                              data: {
                                type: "array",
                                items: {
                                  $ref: "#/components/schemas/KnowledgeBase",
                                },
                              },
                              count: { type: "integer" },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            400: {
              description: "Bad Request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/sync": {
        post: {
          tags: ["General"],
          summary: "Sync Data",
          description: "Sinkronisasi data dari aplikasi mobile offline",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    tickets: {
                      type: "array",
                      items: { type: "object" },
                    },
                    progress_updates: {
                      type: "array",
                      items: { type: "object" },
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Sync completed successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      results: {
                        type: "object",
                        properties: {
                          tickets: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                local_id: { type: "integer" },
                                server_id: { type: "integer" },
                                ticket_number: { type: "string" },
                              },
                            },
                          },
                          progress_updates: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                local_id: { type: "integer" },
                                server_id: { type: "integer" },
                              },
                            },
                          },
                          errors: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                type: { type: "string" },
                                local_id: { type: "integer" },
                                // ... (kode sebelumnya) ...
                                error: { type: "string" },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/admin/roles": {
        get: {
          tags: ["Admin Operations"],
          summary: "Get All Roles",
          description:
            "Mendapatkan daftar semua peran (role) dan konfigurasi izinnya",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            role_key: { type: "string" },
                            permissions: {
                              type: "array",
                              items: { type: "string" },
                            },
                            description: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            403: {
              description: "Forbidden",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/admin/opd": {
        get: {
          tags: ["Admin Operations"],
          summary: "Get OPDs",
          description: "Mendapatkan daftar OPD (Organisasi Perangkat Daerah)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "is_active",
              in: "query",
              description: "Filter by active status",
              schema: { type: "boolean" },
            },
            {
              name: "page",
              in: "query",
              description: "Page number",
              schema: { type: "integer", default: 1 },
            },
            {
              name: "limit",
              in: "query",
              description: "Items per page",
              schema: { type: "integer", default: 20 },
            },
          ],
          responses: {
            200: {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "integer" },
                            name: { type: "string" },
                            code: { type: "string" },
                            address: { type: "string" },
                            is_active: { type: "boolean" },
                          },
                        },
                      },
                      pagination: {
                        type: "object",
                        properties: {
                          page: { type: "integer" },
                          limit: { type: "integer" },
                          total: { type: "integer" },
                          total_pages: { type: "integer" },
                        },
                      },
                    },
                  },
                },
              },
            },
            403: {
              description: "Forbidden",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/admin/opd/{id}/technicians": {
        get: {
          tags: ["Admin Operations"],
          summary: "Get Technicians by OPD",
          description: "Mendapatkan daftar teknisi berdasarkan ID OPD",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "OPD ID",
              schema: { type: "integer" },
            },
          ],
          responses: {
            200: {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "array",
                        items: { $ref: "#/components/schemas/User" },
                      },
                    },
                  },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/admin/opd/{id}/pegawai": {
        get: {
          tags: ["Admin Operations"],
          summary: "Get Employees by OPD",
          description: "Mendapatkan daftar pegawai OPD berdasarkan ID OPD",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "OPD ID",
              schema: { type: "integer" },
            },
          ],
          responses: {
            200: {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "array",
                        items: { $ref: "#/components/schemas/User" },
                      },
                    },
                  },
                },
              },
            },
            403: {
              description: "Forbidden",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/admin/opd/{id}/calendar": {
        put: {
          tags: ["Admin Operations"],
          summary: "Update OPD Calendar",
          description: "Memperbarui kalender (jam kerja dan hari libur) OPD",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "OPD ID",
              schema: { type: "integer" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    working_hours: { type: "array", items: { type: "object" } },
                    holidays: {
                      type: "array",
                      items: { type: "string", format: "date" },
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "OPD calendar updated successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      opd: { type: "object" },
                    },
                  },
                },
              },
            },
            403: {
              description: "Forbidden",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/admin/technicians/{id}/skills": {
        put: {
          tags: ["Admin Operations"],
          summary: "Update Technician Skills",
          description: "Memperbarui keahlian dan sertifikasi teknisi",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Technician User ID",
              schema: { type: "integer" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["skills"],
                  properties: {
                    skills: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          level: { type: "string" },
                          category: { type: "string" },
                        },
                      },
                    },
                    expertise_level: { type: "string" },
                    certifications: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Technician skills updated successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      skills: {
                        type: "array",
                        items: { type: "object" },
                      },
                    },
                  },
                },
              },
            },
            400: {
              description: "Bad Request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            403: {
              description: "Forbidden",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/admin/sla": {
        post: {
          tags: ["Admin Operations"],
          summary: "Upsert SLA Configuration",
          description:
            "Menambahkan atau memperbarui konfigurasi SLA untuk sebuah OPD",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["opd_id", "configs"],
                  properties: {
                    opd_id: { type: "integer" },
                    configs: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          priority: { type: "string" },
                          resolution_time: { type: "integer" },
                          description: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "SLA configuration saved successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      data: {
                        type: "array",
                        items: { type: "object" },
                      },
                    },
                  },
                },
              },
            },
            400: {
              description: "Bad Request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            403: {
              description: "Forbidden",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
        get: {
          tags: ["Admin Operations"],
          summary: "Get SLA Configuration",
          description:
            "Mendapatkan konfigurasi SLA untuk sebuah OPD. Admin OPD otomatis menggunakan OPD mereka sendiri.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "opd_id",
              in: "query",
              required: false,
              description:
                "OPD ID (wajib untuk super admin, opsional untuk admin OPD)",
              schema: { type: "integer" },
            },
          ],
          responses: {
            200: {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "array",
                        items: { $ref: "#/components/schemas/SLAConfig" },
                      },
                    },
                  },
                },
              },
            },
            400: {
              description: "Bad Request - opd_id required for super admin",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            403: {
              description: "Forbidden",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/admin/catalog/items": {
        post: {
          tags: ["Catalog"],
          summary: "Create Service Catalog Item",
          description:
            "Menambahkan item baru ke katalog layanan (Level 2: sub_layanan atau Level 3: layanan). Item otomatis ditautkan ke OPD admin yang login.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["item_name", "item_level"],
                  properties: {
                    catalog_id: {
                      type: "integer",
                      description:
                        "ID Level 1 catalog (wajib jika buat Level 2)",
                    },
                    parent_item_id: {
                      type: "integer",
                      description: "ID Level 2 item (wajib jika buat Level 3)",
                    },
                    item_name: { type: "string" },
                    description: { type: "string" },
                    item_level: {
                      type: "string",
                      enum: ["sub_layanan", "layanan"],
                      description: "sub_layanan (L2) atau layanan (L3)",
                    },
                    needAsset: {
                      type: "boolean",
                      description:
                        "Apakah layanan ini membutuhkan identifikasi aset",
                    },
                    workflow: {
                      type: "string",
                      enum: ["approval", "internal"],
                      description:
                        "Tipe alur kerja: approval (butuh persetujuan) atau internal",
                    },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: "Service catalog item created successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      data: { $ref: "#/components/schemas/ServiceCatalogItem" },
                    },
                  },
                },
              },
            },
            400: {
              description: "Bad Request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            403: {
              description: "Forbidden",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/admin/catalog/items/{id}": {
        put: {
          tags: ["Catalog"],
          summary: "Update Service Catalog Item",
          description:
            "Memperbarui item katalog layanan. Hanya bisa mengedit item milik OPD sendiri.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Service Catalog Item ID",
              schema: { type: "integer" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    item_name: { type: "string" },
                    description: { type: "string" },
                    is_active: { type: "boolean" },
                    display_order: { type: "integer" },
                    needAsset: {
                      type: "boolean",
                      description:
                        "Apakah layanan ini membutuhkan identifikasi aset",
                    },
                    workflow: {
                      type: "string",
                      enum: ["approval", "internal"],
                      description:
                        "Tipe alur kerja: approval (butuh persetujuan) atau internal",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Service catalog item updated successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      data: { $ref: "#/components/schemas/ServiceCatalogItem" },
                    },
                  },
                },
              },
            },
            404: {
              description: "Item not found or access denied",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
        delete: {
          tags: ["Catalog"],
          summary: "Delete Service Catalog Item",
          description:
            "Menghapus item katalog layanan. Hanya bisa menghapus item milik OPD sendiri. Gagal jika item masih memiliki sub-layanan atau digunakan dalam tiket aktif.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Service Catalog Item ID",
              schema: { type: "integer" },
            },
          ],
          responses: {
            200: {
              description: "Service catalog item deleted successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      data: { $ref: "#/components/schemas/ServiceCatalogItem" },
                    },
                  },
                },
              },
            },
            400: {
              description:
                "Bad Request - Item masih memiliki sub-layanan atau digunakan dalam tiket",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            404: {
              description: "Item not found or access denied",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/assets/qr/{qr_code}": {
        get: {
          tags: ["General"],
          summary: "Scan Asset QR Code",
          description: "Mendapatkan informasi aset berdasarkan kode QR",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "qr_code",
              in: "path",
              required: true,
              description: "Asset QR Code",
              schema: { type: "string" },
            },
          ],
          responses: {
            200: {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    oneOf: [
                      {
                        type: "object",
                        properties: {
                          success: { type: "boolean" },
                          action: { type: "string", enum: ["create_ticket"] },
                          message: { type: "string" },
                          asset: {
                            type: "object",
                            properties: {
                              id: { type: "integer" },
                              name: { type: "string" },
                              type: { type: "string" },
                              location: { type: "string" },
                              opd: { type: "string" },
                            },
                          },
                        },
                      },
                      {
                        type: "object",
                        properties: {
                          success: { type: "boolean" },
                          action: {
                            type: "string",
                            enum: ["technician_check_in"],
                          },
                          message: { type: "string" },
                          asset: {
                            type: "object",
                            properties: {
                              id: { type: "integer" },
                              name: { type: "string" },
                              type: { type: "string" },
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            403: {
              description: "Forbidden",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            404: {
              description: "Asset not found",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/incidents/{id}/comments": {
        post: {
          tags: ["Incident Management"],
          summary: "Add Comment to Incident",
          description: "Menambahkan komentar pada insiden",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Incident ID",
              schema: { type: "integer" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CommentRequest" },
              },
            },
          },
          responses: {
            201: {
              description: "Comment added successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      comment: {
                        type: "object",
                        properties: {
                          id: { type: "integer" },
                          content: { type: "string" },
                          is_internal: { type: "boolean" },
                          created_at: { type: "string", format: "date-time" },
                          user: { $ref: "#/components/schemas/User" },
                        },
                      },
                    },
                  },
                },
              },
            },
            400: {
              description: "Bad Request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/requests/{id}/comments": {
        post: {
          tags: ["Service Request Management"],
          summary: "Add Comment to Service Request",
          description: "Menambahkan komentar pada permintaan layanan",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Service Request ID",
              schema: { type: "integer" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CommentRequest" },
              },
            },
          },
          responses: {
            201: {
              description: "Comment added successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      comment: {
                        type: "object",
                        properties: {
                          id: { type: "integer" },
                          content: { type: "string" },
                          is_internal: { type: "boolean" },
                          created_at: { type: "string", format: "date-time" },
                          user: { $ref: "#/components/schemas/User" },
                        },
                      },
                    },
                  },
                },
              },
            },
            400: {
              description: "Bad Request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/incidents/{id}/progress": {
        post: {
          tags: ["Incident Management"],
          summary: "Add Progress Update to Incident",
          description: "Menambahkan pembaruan progres pada insiden",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Incident ID",
              schema: { type: "integer" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProgressUpdateRequest" },
              },
            },
          },
          responses: {
            201: {
              description: "Progress update added successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      data: {
                        type: "object",
                        properties: {
                          progress: { type: "object" },
                          current_state: {
                            type: "object",
                            properties: {
                              status: { type: "string" },
                              stage: { type: "string" },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            400: {
              description: "Bad Request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            403: {
              description: "Forbidden",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/requests/{id}/progress": {
        post: {
          tags: ["Service Request Management"],
          summary: "Add Progress Update to Service Request",
          description: "Menambahkan pembaruan progres pada permintaan layanan",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Service Request ID",
              schema: { type: "integer" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["update_number", "status_change"],
                  properties: {
                    update_number: { type: "integer" },
                    status_change: { type: "string" },
                    stage_change: { type: "string" },
                    notes: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: "Progress update added successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      data: {
                        type: "object",
                        properties: {
                          progress: { type: "object" },
                          current_state: {
                            type: "object",
                            properties: {
                              status: { type: "string" },
                              stage: { type: "string" },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            400: {
              description: "Bad Request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            403: {
              description: "Forbidden",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/admin/audit-logs": {
        get: {
          tags: ["Admin Operations"],
          summary: "Get Audit Logs",
          description: "Mendapatkan log audit aktivitas pengguna",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "user_id",
              in: "query",
              description: "Filter by User ID",
              schema: { type: "integer" },
            },
            {
              name: "action",
              in: "query",
              description: "Filter by action",
              schema: { type: "string" },
            },
            {
              name: "date_from",
              in: "query",
              description: "Filter by start date",
              schema: { type: "string", format: "date-time" },
            },
            {
              name: "date_to",
              in: "query",
              description: "Filter by end date",
              schema: { type: "string", format: "date-time" },
            },
            {
              name: "page",
              in: "query",
              description: "Page number",
              schema: { type: "integer", default: 1 },
            },
            {
              name: "limit",
              in: "query",
              description: "Items per page",
              schema: { type: "integer", default: 100 },
            },
          ],
          responses: {
            200: {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "integer" },
                            ticket_id: { type: "integer" },
                            user_id: { type: "integer" },
                            action: { type: "string" },
                            description: { type: "string" },
                            created_at: { type: "string", format: "date-time" },
                            user: { $ref: "#/components/schemas/User" },
                            ticket: {
                              type: "object",
                              properties: {
                                ticket_number: { type: "string" },
                                title: { type: "string" },
                              },
                            },
                          },
                        },
                      },
                      pagination: {
                        type: "object",
                        properties: {
                          page: { type: "integer" },
                          limit: { type: "integer" },
                          total: { type: "integer" },
                          total_pages: { type: "integer" },
                        },
                      },
                    },
                  },
                },
              },
            },
            403: {
              description: "Forbidden",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/knowledge-base": {
        get: {
          tags: ["Knowledge Base"],
          summary: "Get All Knowledge Base Articles",
          description: "Mendapatkan semua artikel pengetahuan",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "active",
              in: "query",
              description: "Filter by active status",
              schema: { type: "boolean" },
            },
            {
              name: "category",
              in: "query",
              description: "Filter by category",
              schema: { type: "string" },
            },
            {
              name: "search",
              in: "query",
              description: "Search by title or description",
              schema: { type: "string" },
            },
          ],
          responses: {
            200: {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "boolean" },
                      data: {
                        type: "array",
                        items: { $ref: "#/components/schemas/KnowledgeBase" },
                      },
                    },
                  },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
        post: {
          tags: ["Knowledge Base"],
          summary: "Create Knowledge Base Article",
          description: "Membuat artikel pengetahuan baru",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["judul_kb", "deskripsi_kb"],
                  properties: {
                    judul_kb: { type: "string" },
                    kategori_kb: { type: "string" },
                    deskripsi_kb: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: "Knowledge base article created successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "boolean" },
                      message: { type: "string" },
                      data: { $ref: "#/components/schemas/KnowledgeBase" },
                    },
                  },
                },
              },
            },
            400: {
              description: "Bad Request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            403: {
              description: "Forbidden",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/knowledge-base/{id}": {
        get: {
          tags: ["Knowledge Base"],
          summary: "Get Knowledge Base Article by ID",
          description: "Mendapatkan artikel pengetahuan berdasarkan ID",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Knowledge Base Article ID",
              schema: { type: "integer" },
            },
          ],
          responses: {
            200: {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "boolean" },
                      data: { $ref: "#/components/schemas/KnowledgeBase" },
                    },
                  },
                },
              },
            },
            404: {
              description: "Knowledge base not found",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
        put: {
          tags: ["Knowledge Base"],
          summary: "Update Knowledge Base Article",
          description: "Memperbarui artikel pengetahuan",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Knowledge Base Article ID",
              schema: { type: "integer" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    judul_kb: { type: "string" },
                    kategori_kb: { type: "string" },
                    deskripsi_kb: { type: "string" },
                    is_active: { type: "integer" },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Knowledge base article updated successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "boolean" },
                      message: { type: "string" },
                      data: { $ref: "#/components/schemas/KnowledgeBase" },
                    },
                  },
                },
              },
            },
            403: {
              description: "Forbidden",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            404: {
              description: "Knowledge base not found",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
        delete: {
          tags: ["Knowledge Base"],
          summary: "Delete Knowledge Base Article",
          description: "Menghapus artikel pengetahuan secara permanen",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Knowledge Base Article ID",
              schema: { type: "integer" },
            },
          ],
          responses: {
            200: {
              description: "Knowledge base article deleted successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "boolean" },
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
            403: {
              description: "Forbidden",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/knowledge-base/{id}/deactivate": {
        patch: {
          tags: ["Knowledge Base"],
          summary: "Deactivate Knowledge Base Article",
          description: "Menonaktifkan artikel pengetahuan (soft delete)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Knowledge Base Article ID",
              schema: { type: "integer" },
            },
          ],
          responses: {
            200: {
              description: "Knowledge base article deactivated successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "boolean" },
                      message: { type: "string" },
                      data: { $ref: "#/components/schemas/KnowledgeBase" },
                    },
                  },
                },
              },
            },
            403: {
              description: "Forbidden",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            404: {
              description: "Knowledge base not found",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/surveys": {
        get: {
          tags: ["Surveys"],
          summary: "Get All Surveys (Admin)",
          description: "Mendapatkan semua survey (untuk admin)",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "boolean" },
                      data: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Survey" },
                      },
                    },
                  },
                },
              },
            },
            403: {
              description: "Forbidden",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
        post: {
          tags: ["Surveys"],
          summary: "Submit Survey",
          description: "Mengirimkan survey untuk sebuah tiket",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["ticket_id", "rating"],
                  properties: {
                    ticket_id: { type: "integer" },
                    rating: { type: "integer" },
                    feedback: { type: "string" },
                    category: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: "Survey submitted successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      data: { $ref: "#/components/schemas/Survey" },
                    },
                  },
                },
              },
            },
            400: {
              description: "Bad Request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/surveys": {
        get: {
          tags: ["Surveys"],
          summary: "Get All Surveys",
          description: "Mendapatkan semua hasil survey (Admin/Report)",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "boolean" },
                      data: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Survey" },
                      },
                    },
                  },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
        post: {
          tags: ["Surveys"],
          summary: "Submit Survey",
          description: "Mengirimkan survey kepuasan layanan",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["ticket_id", "rating", "feedback"],
                  properties: {
                    ticket_id: { type: "integer" },
                    rating: { type: "integer" },
                    feedback: { type: "string" },
                    category: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: "Survey submitted successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      data: { $ref: "#/components/schemas/Survey" },
                    },
                  },
                },
              },
            },
            400: {
              description: "Bad Request (e.g. Survey already exists)",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/surveys/my-surveys": {
        get: {
          tags: ["Surveys"],
          summary: "Get My Surveys",
          description:
            "Mendapatkan survey yang diajukan oleh pengguna yang sedang login",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Survey" },
                      },
                    },
                  },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/surveys/check/{ticket_id}": {
        get: {
          tags: ["Surveys"],
          summary: "Check if Ticket Has Survey",
          description: "Memeriksa apakah sebuah tiket sudah memiliki survey",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "ticket_id",
              in: "path",
              required: true,
              description: "Ticket ID",
              schema: { type: "integer" },
            },
          ],
          responses: {
            200: {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      hasSurvey: { type: "boolean" },
                    },
                  },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/surveys/{id}": {
        get: {
          tags: ["Surveys"],
          summary: "Get Survey by ID",
          description: "Mendapatkan detail survey berdasarkan ID",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Survey ID",
              schema: { type: "integer" },
            },
          ],
          responses: {
            200: {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "boolean" },
                      data: { $ref: "#/components/schemas/Survey" },
                    },
                  },
                },
              },
            },
            404: {
              description: "Survey not found",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/public/faq": {
        get: {
          tags: ["FAQ"],
          summary: "Get Public FAQs",
          description: "Mendapatkan daftar FAQ publik (filter by OPD & Keyword)",
          parameters: [
            {
              name: "opd_id",
              in: "query",
              description: "Filter by OPD ID",
              schema: { type: "integer" },
            },
            {
              name: "keyword",
              in: "query",
              description: "Search keyword",
              schema: { type: "string" },
            },
          ],
          responses: {
            200: {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "boolean" },
                      message: { type: "string" },
                      data: {
                        type: "array",
                        items: { $ref: "#/components/schemas/FAQ" },
                      },
                    },
                  },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/faq/opd": {
        get: {
          tags: ["FAQ"],
          summary: "Get My OPD FAQs",
          description: "Mendapatkan daftar FAQ khusus OPD pengguna (Authenticated)",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "boolean" },
                      message: { type: "string" },
                      data: {
                        type: "array",
                        items: { $ref: "#/components/schemas/FAQ" },
                      },
                    },
                  },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/faq": {
        post: {
          tags: ["FAQ"],
          summary: "Create FAQ",
          description: "Membuat FAQ baru (Authenticated)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["question", "answer", "opd_id"],
                  properties: {
                    question: { type: "string" },
                    answer: { type: "string" },
                    opd_id: { type: "integer" },
                    status: { 
                      type: "string", 
                      enum: ["published", "draft"],
                      default: "published"
                    },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: "FAQ created successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "boolean" },
                      message: { type: "string" },
                      data: { $ref: "#/components/schemas/FAQ" },
                    },
                  },
                },
              },
            },
            400: {
              description: "Bad Request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            500: {
              description: "Server Error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/admin/audit-logs": {
        get: {
          tags: ["Admin"],
          summary: "Get Audit Logs",
          description: "Mendapatkan log aktivitas sistem (Admin/Report)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "user_id",
              in: "query",
              description: "Filter by User ID",
              schema: { type: "integer" },
            },
            {
              name: "action",
              in: "query",
              description: "Filter by action type",
              schema: { type: "string" },
            },
            {
              name: "date_from",
              in: "query",
              description: "Filter from date",
              schema: { type: "string", format: "date-time" },
            },
            {
              name: "date_to",
              in: "query",
              description: "Filter to date",
              schema: { type: "string", format: "date-time" },
            },
          ],
          responses: {
            200: {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "array",
                        items: { type: "object" },
                      },
                      pagination: {
                        type: "object",
                        properties: {
                          page: { type: "integer" },
                          limit: { type: "integer" },
                          total: { type: "integer" },
                          total_pages: { type: "integer" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/sync": {
        post: {
          tags: ["Utility"],
          summary: "Offline Sync",
          description: "Sinkronisasi data dari mode offline (Mobile)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    tickets: { type: "array", items: { type: "object" } },
                    progress_updates: {
                      type: "array",
                      items: { type: "object" },
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Sync successful",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      results: { type: "object" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/assets/qr/{qr_code}": {
        get: {
          tags: ["Assets"],
          summary: "Scan QR Code",
          description:
            "Scan QR Code aset untuk mendapatkan info atau check-in teknisi",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "qr_code",
              in: "path",
              required: true,
              description: "QR Code string",
              schema: { type: "string" },
            },
          ],
          responses: {
            200: {
              description: "Successful scan",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      action: {
                        type: "string",
                        enum: ["create_ticket", "technician_check_in"],
                      },
                      message: { type: "string" },
                      asset: { type: "object" },
                    },
                  },
                },
              },
            },
            404: {
              description: "Asset not found",
            },
          },
        },
      },
      "/api/v1/admin/roles": {
        get: {
          tags: ["Admin"],
          summary: "Get Roles Configuration",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: { type: "array", items: { type: "object" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/admin/opd": {
        get: {
          tags: ["Admin"],
          summary: "Get OPD List",
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: { type: "array", items: { type: "object" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/admin/opd/{id}/technicians": {
        get: {
          tags: ["Admin"],
          summary: "Get Technicians by OPD",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "integer" },
            },
          ],
          responses: {
            200: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "array",
                        items: { $ref: "#/components/schemas/User" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/admin/opd/{id}/pegawai": {
        get: {
          tags: ["Admin"],
          summary: "Get Employees by OPD",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "integer" },
            },
          ],
          responses: {
            200: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "array",
                        items: { $ref: "#/components/schemas/User" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/admin/opd/{id}/calendar": {
        put: {
          tags: ["Admin"],
          summary: "Update OPD Calendar",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "integer" },
            },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    working_hours: { type: "object" },
                    holidays: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/admin/technicians/{id}/skills": {
        put: {
          tags: ["Admin"],
          summary: "Update Technician Skills",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "integer" },
            },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    skills: { type: "array", items: { type: "object" } },
                    expertise_level: { type: "string" },
                    certifications: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/admin/sla": {
        get: {
          tags: ["Admin"],
          summary: "Get SLA Configuration",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "opd_id",
              in: "query",
              schema: { type: "integer" },
            },
          ],
          responses: {
            200: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "array",
                        items: { $ref: "#/components/schemas/SLAConfig" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ["Admin"],
          summary: "Upsert SLA Configuration",
          security: [{ bearerAuth: [] }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    opd_id: { type: "integer" },
                    configs: {
                      type: "array",
                      items: { $ref: "#/components/schemas/SLAConfig" },
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  apis: ["./index.js"], // Path to the API docs
};

const specs = swaggerJsdoc(options);

const swaggerUiOptions = {
  explorer: true,
  customCss: ".swagger-ui .topbar { display: none }",
  customSiteTitle: "Service Desk API Documentation",
};

module.exports = {
  swaggerDocs: specs,
  swaggerUiOptions,
};
