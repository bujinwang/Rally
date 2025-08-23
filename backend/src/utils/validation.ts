import Joi from 'joi';

export const registerSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().pattern(/^\+?[\d\s\-\(\)]+$/).optional(),
  password: Joi.string().min(8).required(),
  deviceId: Joi.string().optional()
});

export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
  deviceId: Joi.string().optional()
});

export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required()
});

export const createSessionSchema = Joi.object({
  name: Joi.string().min(3).max(200).required(),
  scheduledAt: Joi.date().iso().required(),
  location: Joi.string().optional(),
  maxPlayers: Joi.number().integer().min(1).max(50).default(20),
  skillLevel: Joi.string().optional(),
  cost: Joi.number().min(0).optional(),
  description: Joi.string().optional()
});

export const updateSessionSchema = Joi.object({
  name: Joi.string().min(3).max(200).optional(),
  location: Joi.string().optional(),
  maxPlayers: Joi.number().integer().min(1).max(50).optional(),
  skillLevel: Joi.string().optional(),
  cost: Joi.number().min(0).optional(),
  description: Joi.string().optional()
});

export const validate = (schema: Joi.Schema) => {
  return (req: any, res: any, next: any) => {
    const { error } = schema.validate(req.body, { abortEarly: false });

    if (error) {
      const errors = error.details.map((detail: any) => detail.message);
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: errors
        },
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
};