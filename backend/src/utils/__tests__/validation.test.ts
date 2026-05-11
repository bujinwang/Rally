import { validate } from '../validation';
import Joi from 'joi';
import express from 'express';

const app = express();
app.use(express.json());

describe('validate middleware', () => {
  it('passes valid data through', async () => {
    const schema = Joi.object({ name: Joi.string().required() });
    app.post('/test', validate(schema), (req, res) => { res.json({ success: true, data: req.body }); });

    const request = require('supertest');
    const res = await request(app).post('/test').send({ name: 'David' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('David');
  });

  it('rejects invalid data with 400', async () => {
    const schema = Joi.object({ name: Joi.string().required() });
    const app2 = express();
    app2.use(express.json());
    app2.post('/test', validate(schema), (req, res) => { res.json({ ok: true }); });

    const request = require('supertest');
    const res = await request(app2).post('/test').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
