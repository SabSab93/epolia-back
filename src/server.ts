import app from '@/app';
import { config } from '@/config/env';

app.listen(config.port, () => {
  console.log(`Server running on http://localhost:${config.port}`);
  if (config.nodeEnv !== 'production') {
    console.log(`Swagger: http://localhost:${config.port}/api/docs`);
  }
});
