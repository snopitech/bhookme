package bhookme_backend.service;

import bhookme_backend.dto.MessageRequest;
import bhookme_backend.dto.MessageResponse;
import bhookme_backend.model.Car;
import bhookme_backend.model.Message;
import bhookme_backend.model.Property;
import bhookme_backend.model.User;
import bhookme_backend.repository.CarRepository;
import bhookme_backend.repository.MessageRepository;
import bhookme_backend.repository.PropertyRepository;
import bhookme_backend.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class MessageService {

    private static final DateTimeFormatter TIME_FORMAT = DateTimeFormatter.ofPattern("MMM dd, yyyy h:mm a");

    private final MessageRepository messageRepository;
    private final UserRepository userRepository;
    private final PropertyRepository propertyRepository;
    private final CarRepository carRepository;
    private final EmailService emailService;

    public MessageService(MessageRepository messageRepository, UserRepository userRepository,
                           PropertyRepository propertyRepository, CarRepository carRepository,
                           EmailService emailService) {
        this.messageRepository = messageRepository;
        this.userRepository = userRepository;
        this.propertyRepository = propertyRepository;
        this.carRepository = carRepository;
        this.emailService = emailService;
    }

    // Guest -> host, about a specific listing. The host is always
    // derived from the listing itself, never trusted from the client.
    @Transactional
    public MessageResponse sendToHost(String senderEmail, MessageRequest request) {
        User sender = findUser(senderEmail);

        if (request.getContent() == null || request.getContent().trim().isEmpty()) {
            throw new RuntimeException("Message cannot be empty");
        }
        if (request.getPropertyId() == null && request.getCarId() == null) {
            throw new RuntimeException("A property or car must be specified");
        }

        Property property = null;
        Car car = null;
        User host;
        String listingLabel;

        if (request.getPropertyId() != null) {
            property = propertyRepository.findById(request.getPropertyId())
                    .orElseThrow(() -> new RuntimeException("Property not found"));
            host = property.getHost();
            listingLabel = property.getTitle();
        } else {
            car = carRepository.findById(request.getCarId())
                    .orElseThrow(() -> new RuntimeException("Car not found"));
            host = car.getHost();
            listingLabel = car.getMake() + " " + car.getModel();
        }

        if (host.getId().equals(sender.getId())) {
            throw new RuntimeException("You cannot message yourself about your own listing");
        }

        Message message = new Message();
        message.setSender(sender);
        message.setReceiver(host);
        message.setProperty(property);
        message.setCar(car);
        message.setSubject(request.getSubject() != null ? request.getSubject() : "Question about: " + listingLabel);
        message.setContent(request.getContent());
        message.setIsRead(false);

        Message saved = messageRepository.save(message);

        try {
            String body = "Hi " + host.getFirstName() + ",\n\n"
                    + "You have a new message about " + listingLabel + " from " + sender.getFirstName() + " " + sender.getLastName() + ":\n\n"
                    + "\"" + request.getContent() + "\"\n\n"
                    + "Log in to your host dashboard to reply.\n\n"
                    + "- The bhookme team";
            emailService.sendSimpleEmail(host.getEmail(), "New message about " + listingLabel, body);
        } catch (Exception e) {
            System.err.println("Failed to send message-notification email to " + host.getEmail() + ": " + e.getMessage());
        }

        return toResponse(saved);
    }

    // Host -> guest, replying within the same property/car conversation.
    @Transactional
    public MessageResponse reply(String senderEmail, Long receiverId, MessageRequest request) {
        User sender = findUser(senderEmail);
        User receiver = userRepository.findById(receiverId)
                .orElseThrow(() -> new RuntimeException("Recipient not found"));

        if (request.getContent() == null || request.getContent().trim().isEmpty()) {
            throw new RuntimeException("Message cannot be empty");
        }

        Property property = request.getPropertyId() != null
                ? propertyRepository.findById(request.getPropertyId()).orElse(null)
                : null;
        Car car = request.getCarId() != null
                ? carRepository.findById(request.getCarId()).orElse(null)
                : null;

        Message message = new Message();
        message.setSender(sender);
        message.setReceiver(receiver);
        message.setProperty(property);
        message.setCar(car);
        message.setSubject(request.getSubject());
        message.setContent(request.getContent());
        message.setIsRead(false);

        Message saved = messageRepository.save(message);

        try {
            String body = "Hi " + receiver.getFirstName() + ",\n\n"
                    + sender.getFirstName() + " " + sender.getLastName() + " replied to your message on bhookme:\n\n"
                    + "\"" + request.getContent() + "\"\n\n"
                    + "- The bhookme team";
            emailService.sendSimpleEmail(receiver.getEmail(), "New reply on bhookme", body);
        } catch (Exception e) {
            System.err.println("Failed to send reply-notification email to " + receiver.getEmail() + ": " + e.getMessage());
        }

        return toResponse(saved);
    }

    // The full thread between the current user and one other user,
    // scoped to a specific property. Marks the current user's unread
    // messages in it as read, same as eStore.
    @Transactional
    public List<MessageResponse> getPropertyConversation(String currentUserEmail, Long propertyId, Long otherUserId) {
        User currentUser = findUser(currentUserEmail);
        User otherUser = userRepository.findById(otherUserId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        Property property = propertyRepository.findById(propertyId)
                .orElseThrow(() -> new RuntimeException("Property not found"));

        List<Message> messages = messageRepository.findConversationForProperty(currentUser, otherUser, property);
        markReceivedAsRead(messages, currentUser);
        return messages.stream().map(this::toResponse).collect(Collectors.toList());
    }

    @Transactional
    public List<MessageResponse> getCarConversation(String currentUserEmail, Long carId, Long otherUserId) {
        User currentUser = findUser(currentUserEmail);
        User otherUser = userRepository.findById(otherUserId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        Car car = carRepository.findById(carId)
                .orElseThrow(() -> new RuntimeException("Car not found"));

        List<Message> messages = messageRepository.findConversationForCar(currentUser, otherUser, car);
        markReceivedAsRead(messages, currentUser);
        return messages.stream().map(this::toResponse).collect(Collectors.toList());
    }

    // Every conversation partner the current user (host) has, across
    // all their listings, with the last message and unread count.
    @Transactional(readOnly = true)
    public List<MessageResponse.ConversationPartner> getConversationPartners(String userEmail) {
        User user = findUser(userEmail);
        List<User> partners = messageRepository.findConversationPartners(user);
        List<MessageResponse.ConversationPartner> result = new ArrayList<>();

        for (User partner : partners) {
            List<Message> conversation = messageRepository.findConversationBetweenUsers(user, partner);
            Message last = conversation.isEmpty() ? null : conversation.get(conversation.size() - 1);
            long unread = conversation.stream()
                    .filter(m -> m.getReceiver().getId().equals(user.getId()) && !m.getIsRead())
                    .count();

            MessageResponse.ConversationPartner partnerInfo = new MessageResponse.ConversationPartner();
            partnerInfo.setUserId(partner.getId());
            partnerInfo.setName(partner.getFirstName() + " " + partner.getLastName());
            partnerInfo.setLastMessage(last != null ? last.getContent() : null);
            partnerInfo.setLastMessageTime(last != null ? last.getCreatedAt() : null);
            partnerInfo.setUnreadCount((int) unread);
            result.add(partnerInfo);
        }

        result.sort(Comparator.comparing(
                (MessageResponse.ConversationPartner p) -> p.getLastMessageTime() == null,
                Comparator.naturalOrder()
        ).thenComparing(MessageResponse.ConversationPartner::getLastMessageTime, Comparator.nullsLast(Comparator.reverseOrder())));

        return result;
    }

    // Host Dashboard inbox + Messages tab: one thread per (other person,
    // listing), newest first. Loads the user's messages and groups them
    // in Java instead of using findConversationPartners, whose query
    // Hibernate 6 can't run.
    //
    // Each thread now includes `iAmListingHost` so the frontend can tell
    // which side of the conversation the current user is on:
    //   - false → current user is the guest; this is a "Messages tab"
    //             thread (guest talking to a host about their listing).
    //   - true  → current user is the host; this is a "Host inbox"
    //             thread (guest messaging them about their listing).
    // The two frontend components filter on this flag.
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getThreads(String userEmail) {
        User user = findUser(userEmail);
        Long myId = user.getId();

        List<Message> mine = messageRepository.findAll().stream()
                .filter(m -> m.getSender() != null && m.getReceiver() != null)
                .filter(m -> m.getSender().getId().equals(myId) || m.getReceiver().getId().equals(myId))
                .filter(m -> m.getProperty() != null || m.getCar() != null)
                .sorted(Comparator.comparing(Message::getCreatedAt,
                        Comparator.nullsFirst(Comparator.naturalOrder())))
                .collect(Collectors.toList());

        // Group by (other person, listing), keeping conversation order.
        Map<String, List<Message>> groups = new LinkedHashMap<>();
        for (Message m : mine) {
            User other = m.getSender().getId().equals(myId) ? m.getReceiver() : m.getSender();
            String listingKey = m.getProperty() != null
                    ? "property-" + m.getProperty().getId()
                    : "car-" + m.getCar().getId();
            groups.computeIfAbsent(other.getId() + "|" + listingKey, k -> new ArrayList<>()).add(m);
        }

        List<Map<String, Object>> threads = new ArrayList<>();
        for (List<Message> group : groups.values()) {
            Message last = group.get(group.size() - 1);
            User partner = last.getSender().getId().equals(myId) ? last.getReceiver() : last.getSender();
            long unread = group.stream()
                    .filter(m -> m.getReceiver().getId().equals(myId) && !Boolean.TRUE.equals(m.getIsRead()))
                    .count();

            Map<String, Object> thread = new HashMap<>();
            thread.put("partnerId", partner.getId());
            thread.put("partnerName", partner.getFirstName() + " " + partner.getLastName());
            if (last.getProperty() != null) {
                thread.put("propertyId", last.getProperty().getId());
                thread.put("listingTitle", last.getProperty().getTitle());
                thread.put("listingType", "property");
            } else {
                thread.put("carId", last.getCar().getId());
                thread.put("listingTitle", last.getCar().getMake() + " " + last.getCar().getModel());
                thread.put("listingType", "car");
            }
            thread.put("lastMessage", last.getContent());
            thread.put("lastMessageTime", last.getCreatedAt());
            thread.put("lastMessageFormatted", last.getCreatedAt() != null ? last.getCreatedAt().format(TIME_FORMAT) : null);
            thread.put("lastFromMe", last.getSender().getId().equals(myId));
            thread.put("unreadCount", unread);
            thread.put("messageCount", group.size());
            thread.put("iAmListingHost", isListingHost(last, myId));
            threads.add(thread);
        }

        threads.sort(Comparator.comparing(
                (Map<String, Object> t) -> (LocalDateTime) t.get("lastMessageTime"),
                Comparator.nullsLast(Comparator.reverseOrder())));
        return threads;
    }

    // Was the current user the host of the listing this message is about?
    private boolean isListingHost(Message message, Long myId) {
        if (message.getProperty() != null && message.getProperty().getHost() != null) {
            return message.getProperty().getHost().getId().equals(myId);
        }
        if (message.getCar() != null && message.getCar().getHost() != null) {
            return message.getCar().getHost().getId().equals(myId);
        }
        return false;
    }

    private void markReceivedAsRead(List<Message> messages, User currentUser) {
        for (Message m : messages) {
            if (m.getReceiver().getId().equals(currentUser.getId()) && !m.getIsRead()) {
                m.setIsRead(true);
                messageRepository.save(m);
            }
        }
    }

    private User findUser(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Account not found"));
    }

    private MessageResponse toResponse(Message message) {
        MessageResponse response = new MessageResponse();
        response.setId(message.getId());
        response.setSenderId(message.getSender().getId());
        response.setSenderName(message.getSender().getFirstName() + " " + message.getSender().getLastName());
        response.setReceiverId(message.getReceiver().getId());
        response.setReceiverName(message.getReceiver().getFirstName() + " " + message.getReceiver().getLastName());
        response.setSubject(message.getSubject());
        response.setContent(message.getContent());
        response.setIsRead(message.getIsRead());
        response.setCreatedAt(message.getCreatedAt());
        response.setFormattedTime(message.getCreatedAt().format(TIME_FORMAT));

        if (message.getProperty() != null) {
            response.setPropertyId(message.getProperty().getId());
            response.setPropertyTitle(message.getProperty().getTitle());
        }
        if (message.getCar() != null) {
            response.setCarId(message.getCar().getId());
            response.setCarLabel(message.getCar().getMake() + " " + message.getCar().getModel());
        }

        return response;
    }
}