// Mails de aviso de vencimiento (EmailJS); se dispara al abrir el panel admin.
import emailjs from '@emailjs/browser';
import { supaClient } from '../../lib/supabase.js';

// Inicializa EmailJS con la Public Key de la cuenta
(function () {
  emailjs.init('5EuZV_5aIYiY9s4HQ');
})();

window.checkAndSendExpirationEmails = async function () {
  const { data: allUsers, error } = await supaClient.from('profiles').select('*');
  if (error) {
    console.error('Error al obtener usuarios para vencimientos:', error.message);
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  allUsers.forEach(async (user) => {
    if (!user.expiry_date || !user.email) return;

    const expiryDate = new Date(user.expiry_date + 'T00:00:00');
    const diffTime = expiryDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let subject = '';
    let message = '';

    if (diffDays === 7) {
      subject = 'Prime Physique - Tu abono vence en 1 semana';
      message = `Hola ${user.name || 'Atleta'}, te escribimos de Prime Physique para recordarte que tu abono vence en 7 días. Asegúrate de renovar a tiempo para mantener tus planificaciones activas.`;
    } else if (diffDays === 3) {
      subject = 'Prime Physique - Quedan 3 días para tu vencimiento';
      message = `Hola ${user.name || 'Atleta'}, tu plan en Prime Physique está a solo 3 días de finalizar. ¡No pierdas el ritmo y renueva tu membresía!`;
    } else if (diffDays === -1) {
      subject = 'Prime Physique - Tu abono ha finalizado';
      message = `Hola ${user.name || 'Atleta'}, notamos que tu abono venció ayer. Para continuar con tus rutinas y seguimientos en la plataforma, por favor efectúa la renovación.`;
    }

    if (subject) {
      const templateParams = {
        to_email: user.email,
        to_name: user.name || 'Atleta',
        subject: subject,
        message: message,
      };

      // Reemplaza 'TU_SERVICE_ID' y 'TU_TEMPLATE_ID' con tus datos de EmailJS
      emailjs.send('service_sh1wbtf', 'template_ilxy30k', templateParams).then(
        (response) => {
          console.log(`Correo de aviso (${diffDays} días) enviado con éxito a ${user.email}`);
        },
        (err) => {
          console.error('Error al enviar correo:', err);
        },
      );
    }
  });
};
