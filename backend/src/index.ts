import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/', (req: Request, res: Response) => {
  return res.send('Hello, Express with TypeScript and CORS!');
});

app.get('/api/v1/users', (req: Request, res: Response) => {
  const users = [
    { id: 1, name: 'Jogn Doe' },
    { id: 2, name: 'Jogn Smith' },
  ];
  return res.json({ users });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
